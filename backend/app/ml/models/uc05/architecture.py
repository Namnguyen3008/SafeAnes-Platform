"""RespFormer architecture restored from the audited UC05 training notebook."""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import nn
from torch.nn import functional as F


NUM_FEATURES = (
    "SPO2", "ETCO2", "RR_CO2", "TV", "MV", "PIP", "PEEP", "PPLAT",
    "MAWP", "FIO2", "COMPLIANCE", "VENT_LEAK", "SET_FIO2", "SET_TV",
    "SET_PIP", "SET_RR", "HR", "MAC",
)
STATIC_FEATURES = (
    "age", "bmi", "asa", "sex_male", "weight", "height", "emop",
)
NUM_CENTER = (
    98, 35, 14, 450, 6, 18, 5, 15, 10, 45, 50, 0, 45, 450, 18, 12, 75, 1,
)
NUM_SCALE = (
    3, 10, 6, 200, 3, 8, 4, 8, 6, 20, 20, 200, 20, 200, 8, 6, 20, 0.5,
)
STATIC_CENTER = (60, 24, 2, 0, 65, 165, 0)
STATIC_SCALE = (15, 5, 1, 1, 15, 10, 1)


@dataclass(frozen=True)
class UC05ArchitectureConfig:
    D_MODEL: int = 256
    WAVE_TOKENS: int = 16
    NUM_TOKENS: int = 60
    N_LAYERS: int = 8
    N_HEADS: int = 8
    FF_DIM: int = 1024
    DROPOUT: float = 0.1


class ConvNeXt1DBlock(nn.Module):
    def __init__(self, channels: int, expansion: int = 4, kernel: int = 7) -> None:
        super().__init__()
        self.dw = nn.Conv1d(
            channels,
            channels,
            kernel,
            padding=kernel // 2,
            groups=channels,
        )
        self.norm = nn.GroupNorm(1, channels)
        self.pw1 = nn.Conv1d(channels, channels * expansion, 1)
        self.pw2 = nn.Conv1d(channels * expansion, channels, 1)
        self.gamma = nn.Parameter(torch.ones(channels) * 1e-6)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.dw(x)
        y = self.norm(y)
        y = F.gelu(self.pw1(y))
        y = self.pw2(y)
        return x + y * self.gamma.view(1, -1, 1)


class WaveEncoder(nn.Module):
    def __init__(self, d: int = 256, tokens: int = 16) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(1, 64, 9, 4, 4),
            nn.GroupNorm(1, 64),
            nn.GELU(),
            nn.Conv1d(64, 128, 5, 2, 2),
            nn.GroupNorm(1, 128),
            nn.GELU(),
            ConvNeXt1DBlock(128),
            ConvNeXt1DBlock(128),
            ConvNeXt1DBlock(128),
            nn.Conv1d(128, d, 3, 2, 1),
            nn.GroupNorm(1, d),
            nn.GELU(),
            ConvNeXt1DBlock(d),
            ConvNeXt1DBlock(d),
            ConvNeXt1DBlock(d),
            nn.AdaptiveAvgPool1d(tokens),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x.unsqueeze(1)).transpose(1, 2)


class RespFormerBackbone(nn.Module):
    def __init__(self, cfg: UC05ArchitectureConfig) -> None:
        super().__init__()
        d = cfg.D_MODEL
        self.cfg = cfg
        self.wave_tokens = cfg.WAVE_TOKENS
        self.encs = nn.ModuleList(
            [WaveEncoder(d, cfg.WAVE_TOKENS) for _ in range(5)]
        )
        self.num_proj = nn.Linear(len(NUM_FEATURES) * 2, d)
        self.num_pool = nn.AdaptiveAvgPool1d(cfg.NUM_TOKENS)
        self.static_mlp = nn.Sequential(
            nn.Linear(len(STATIC_FEATURES) * 2, 128),
            nn.GELU(),
            nn.Linear(128, d),
        )
        self.cls = nn.Parameter(torch.zeros(1, 1, d))
        self.type_emb = nn.Embedding(8, d)
        total = 1 + 5 * cfg.WAVE_TOKENS + cfg.NUM_TOKENS + 1
        self.pos_emb = nn.Parameter(torch.zeros(1, total, d))
        layer = nn.TransformerEncoderLayer(
            d_model=d,
            nhead=cfg.N_HEADS,
            dim_feedforward=cfg.FF_DIM,
            dropout=cfg.DROPOUT,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.tr = nn.TransformerEncoder(layer, cfg.N_LAYERS)
        self.norm = nn.LayerNorm(d)
        self.register_buffer(
            "num_center", torch.tensor(NUM_CENTER, dtype=torch.float32)
        )
        self.register_buffer(
            "num_scale", torch.tensor(NUM_SCALE, dtype=torch.float32)
        )
        self.register_buffer(
            "static_center", torch.tensor(STATIC_CENTER, dtype=torch.float32)
        )
        self.register_buffer(
            "static_scale", torch.tensor(STATIC_SCALE, dtype=torch.float32)
        )
        types = [0]
        for index in range(5):
            types += [index + 1] * cfg.WAVE_TOKENS
        types += [6] * cfg.NUM_TOKENS
        types += [7]
        self.register_buffer("type_indices", torch.tensor(types, dtype=torch.long))
        nn.init.trunc_normal_(self.cls, std=0.02)
        nn.init.trunc_normal_(self.pos_emb, std=0.02)

    def forward(
        self,
        capno: torch.Tensor,
        awp: torch.Tensor,
        ppg: torch.Tensor,
        flow: torch.Tensor,
        resp: torch.Tensor,
        numeric: torch.Tensor,
        numeric_mask: torch.Tensor,
        static: torch.Tensor,
        wave_mask: torch.Tensor,
    ) -> torch.Tensor:
        waves = [capno, awp, ppg, flow, resp]
        batch_size = capno.shape[0]
        toks = [self.cls.expand(batch_size, -1, -1)]
        pads = [
            torch.zeros(batch_size, 1, dtype=torch.bool, device=capno.device)
        ]
        for index, (encoder, values) in enumerate(zip(self.encs, waves)):
            toks.append(encoder(values))
            pads.append(
                (wave_mask[:, index] < 0.5)
                .unsqueeze(1)
                .expand(-1, self.wave_tokens)
            )

        z = (numeric - self.num_center.view(1, 1, -1)) / self.num_scale.view(
            1, 1, -1
        )
        z = torch.nan_to_num(z, nan=0, posinf=0, neginf=0).clamp(-8, 8)
        z = self.num_proj(torch.cat([z, numeric_mask], -1))
        z = self.num_pool(z.transpose(1, 2)).transpose(1, 2)
        toks.append(z)
        pads.append(
            torch.zeros(
                batch_size, self.cfg.NUM_TOKENS, dtype=torch.bool, device=capno.device
            )
        )

        static_mask = torch.isfinite(static).float()
        static_z = (
            static - self.static_center.view(1, -1)
        ) / self.static_scale.view(1, -1)
        static_z = torch.nan_to_num(
            static_z, nan=0, posinf=0, neginf=0
        ).clamp(-8, 8)
        toks.append(
            self.static_mlp(torch.cat([static_z, static_mask], -1)).unsqueeze(1)
        )
        pads.append(torch.zeros(batch_size, 1, dtype=torch.bool, device=capno.device))

        x = torch.cat(toks, 1)
        pad = torch.cat(pads, 1)
        x = x + self.type_emb(self.type_indices).unsqueeze(0) + self.pos_emb[
            :, : x.shape[1]
        ]
        x = self.tr(x, src_key_padding_mask=pad)
        return self.norm(x[:, 0])


class RespFormer(nn.Module):
    def __init__(self, cfg: UC05ArchitectureConfig | None = None) -> None:
        super().__init__()
        self.backbone = RespFormerBackbone(cfg or UC05ArchitectureConfig())
        self.hypox = nn.Linear(self.backbone.cfg.D_MODEL, 3)
        self.vent = nn.Linear(self.backbone.cfg.D_MODEL, 1)

    def forward(self, *args: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        encoded = self.backbone(*args)
        return self.hypox(encoded), self.vent(encoded).squeeze(-1)
