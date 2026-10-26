import {
  Archivo,
  Bricolage_Grotesque,
  DM_Sans,
  Figtree,
  Fraunces,
  Hanken_Grotesk,
  Instrument_Sans,
  Newsreader,
  Outfit,
  Plus_Jakarta_Sans,
  Source_Sans_3,
  Syne,
} from "next/font/google";

// Loaders fuera de Client Components (recomendación de Next).

export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });
export const hanken = Hanken_Grotesk({ subsets: ["latin"], display: "swap" });
export const fraunces = Fraunces({ subsets: ["latin"], display: "swap" });
export const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap" });
export const syne = Syne({ subsets: ["latin"], display: "swap", weight: ["500", "600", "700"] });
export const dmSans = DM_Sans({ subsets: ["latin"], display: "swap" });
export const outfit = Outfit({ subsets: ["latin"], display: "swap" });
export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap" });
export const newsreader = Newsreader({ subsets: ["latin"], display: "swap" });
export const figtree = Figtree({ subsets: ["latin"], display: "swap" });
export const archivo = Archivo({ subsets: ["latin"], display: "swap" });
export const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap" });
