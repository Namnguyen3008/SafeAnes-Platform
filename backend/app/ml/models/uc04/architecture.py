"""HypoFormer architecture restored from the audited UC04 training notebook."""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import nn
from torch.nn import functional as F


NUM_KEYS = ("MAP", "SBP", "DBP", "HR", "SPO2", "RR", "ETCO2")
STATIC_KEYS = ("age", "bmi", "asa", "emop", "sex_male")
NUM_CENTER = (75.0, 120.0, 65.0, 75.0, 98.0, 14.0, 35.0)
NUM_SCALE = (20.0, 30.0, 20.0, 20.0, 3.0, 6.0, 10.0)
STATIC_CENTER = (60.0, 24.0, 2.0, 0.0, 0.0)
STATIC_SCALE = (15.0, 5.0, 1.0, 1.0, 1.0)


@dataclass(frozen=True)
class UC04ArchitectureConfig:
    D_MODEL: int = 128
    WAVE_TOKENS: int = 24
    NUM_TOKENS: int = 60
    NHEAD: int = 8
    N_LAYERS: int = 6
    FF_DIM: int = 512
    DROPOUT: float = 0.1


class ConvTokenEncoder(nn.Module):
    def __init__(self, d_model: int = 128, n_tokens: int = 24) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(1, 32, kernel_size=9, stride=2, padding=4),
            nn.BatchNorm1d(32),
            nn.GELU(),
            nn.Conv1d(32, 64, kernel_size=7, stride=2, padding=3),
            nn.BatchNorm1d(64),
            nn.GELU(),
            nn.Conv1d(64, d_model, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm1d(d_model),
            nn.GELU(),
            nn.Conv1d(d_model, d_model, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm1d(d_model),
            nn.GELU(),
            nn.AdaptiveAvgPool1d(n_tokens),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x.unsqueeze(1)).transpose(1, 2)


class HypoFormer(nn.Module):
    """State-dict-compatible UC04 multi-horizon classifier."""

    def __init__(self, cfg: UC04ArchitectureConfig | None = None) -> None:
        super().__init__()
        cfg = cfg or UC04ArchitectureConfig()
        d = cfg.D_MODEL
        nt = cfg.WAVE_TOKENS
        self.wave_tokens = nt
        self.num_tokens = cfg.NUM_TOKENS

        self.art_enc = ConvTokenEncoder(d, nt)
        self.ecg_enc = ConvTokenEncoder(d, nt)
        self.ppg_enc = ConvTokenEncoder(d, nt)
        self.capno_enc = ConvTokenEncoder(d, nt)
        self.num_proj = nn.Linear(len(NUM_KEYS) * 2, d)
        self.num_pool = nn.AdaptiveAvgPool1d(cfg.NUM_TOKENS)
        self.static_mlp = nn.Sequential(
            nn.Linear(len(STATIC_KEYS) * 2, 64),
            nn.GELU(),
            nn.Linear(64, d),
        )
        self.cls = nn.Parameter(torch.zeros(1, 1, d))
        self.type_emb = nn.Embedding(7, d)
        total_tokens = 1 + 4 * nt + cfg.NUM_TOKENS + 1
        self.pos_emb = nn.Parameter(torch.zeros(1, total_tokens, d))
        layer = nn.TransformerEncoderLayer(
            d_model=d,
            nhead=cfg.NHEAD,
            dim_feedforward=cfg.FF_DIM,
            dropout=cfg.DROPOUT,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(layer, num_layers=cfg.N_LAYERS)
        self.norm = nn.LayerNorm(d)
        self.heads = nn.ModuleList([nn.Linear(d, 1) for _ in range(3)])
        self.register_buffer("num_center", torch.tensor(NUM_CENTER))
        self.register_buffer("num_scale", torch.tensor(NUM_SCALE))
        self.register_buffer("static_center", torch.tensor(STATIC_CENTER))
        self.register_buffer("static_scale", torch.tensor(STATIC_SCALE))
        nn.init.trunc_normal_(self.pos_emb, std=0.02)
        nn.init.trunc_normal_(self.cls, std=0.02)

    def _numeric_tokens(
        self, x: torch.Tensor, mask: torch.Tensor
    ) -> torch.Tensor:
        center = self.num_center.view(1, 1, -1)
        scale = self.num_scale.view(1, 1, -1)
        z = (x - center) / scale
        z = torch.nan_to_num(z, nan=0.0, posinf=0.0, neginf=0.0).clamp(-6, 6)
        feat = torch.cat([z, mask], dim=-1)
        tok = self.num_proj(feat)
        return self.num_pool(tok.transpose(1, 2)).transpose(1, 2)

    def _static_token(self, x: torch.Tensor) -> torch.Tensor:
        center = self.static_center.view(1, -1)
        scale = self.static_scale.view(1, -1)
        mask = torch.isfinite(x).float()
        z = (x - center) / scale
        z = torch.nan_to_num(z, nan=0.0, posinf=0.0, neginf=0.0).clamp(-6, 6)
        return self.static_mlp(torch.cat([z, mask], dim=-1)).unsqueeze(1)

    def forward(
        self,
        art: torch.Tensor,
        ecg: torch.Tensor,
        ppg: torch.Tensor,
        capno: torch.Tensor,
        numeric: torch.Tensor,
        numeric_mask: torch.Tensor,
        static: torch.Tensor,
        modality_mask: torch.Tensor,
    ) -> torch.Tensor:
        batch_size = art.shape[0]
        toks: list[torch.Tensor] = [
            self.cls.expand(batch_size, -1, -1)
        ]
        masks = [
            torch.zeros(batch_size, 1, dtype=torch.bool, device=art.device)
        ]
        type_ids: list[int] = [0]

        for type_id, encoder, values, present in (
            (1, self.art_enc, art, modality_mask[:, 0]),
            (2, self.ecg_enc, ecg, modality_mask[:, 1]),
            (3, self.ppg_enc, ppg, modality_mask[:, 2]),
            (4, self.capno_enc, capno, modality_mask[:, 3]),
        ):
            toks.append(encoder(values))
            masks.append((present < 0.5).unsqueeze(1).expand(-1, self.wave_tokens))
            type_ids.extend([type_id] * self.wave_tokens)

        toks.append(self._numeric_tokens(numeric, numeric_mask))
        masks.append(
            torch.zeros(
                batch_size, self.num_tokens, dtype=torch.bool, device=art.device
            )
        )
        type_ids.extend([5] * self.num_tokens)
        toks.append(self._static_token(static))
        masks.append(torch.zeros(batch_size, 1, dtype=torch.bool, device=art.device))
        type_ids.append(6)

        x = torch.cat(toks, dim=1)
        key_padding = torch.cat(masks, dim=1)
        ids = torch.tensor(type_ids, dtype=torch.long, device=x.device)
        x = x + self.type_emb(ids).unsqueeze(0) + self.pos_emb[:, : x.shape[1]]
        x = self.transformer(x, src_key_padding_mask=key_padding)
        cls_out = self.norm(x[:, 0])
        return torch.cat([head(cls_out) for head in self.heads], dim=1)
