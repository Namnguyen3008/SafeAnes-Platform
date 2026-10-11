import enCommon from "@/messages/en/common.json";
import enShell from "@/messages/en/shell.json";
import enUc01 from "@/messages/en/uc01.json";
import enUc02 from "@/messages/en/uc02.json";
import enUc03 from "@/messages/en/uc03.json";
import enUc04 from "@/messages/en/uc04.json";
import enUc05 from "@/messages/en/uc05.json";

import viCommon from "@/messages/vi/common.json";
import viShell from "@/messages/vi/shell.json";
import viUc01 from "@/messages/vi/uc01.json";
import viUc02 from "@/messages/vi/uc02.json";
import viUc03 from "@/messages/vi/uc03.json";
import viUc04 from "@/messages/vi/uc04.json";
import viUc05 from "@/messages/vi/uc05.json";

export type Locale = "en" | "vi";

export const messages = {
  en: {
    common: enCommon,
    shell: enShell,
    overview: enCommon.overview,
    uc01: enUc01,
    uc02: enUc02,
    uc03: enUc03,
    uc04: enUc04,
    uc05: enUc05,
  },
  vi: {
    common: viCommon,
    shell: viShell,
    overview: viCommon.overview,
    uc01: viUc01,
    uc02: viUc02,
    uc03: viUc03,
    uc04: viUc04,
    uc05: viUc05,
  },
};

export type MessageSchema = typeof messages.en;
