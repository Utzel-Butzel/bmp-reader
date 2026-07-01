import { readFileSync } from "node:fs";

export const KBV_V28_BEISPIEL_1 = readFileSync(new URL("./fixtures/kbv-v2.8-beispiel-1.xml", import.meta.url), "utf8").trim();
export const KBV_SPEC_V27_ABBILDUNG_3 = readFileSync(
  new URL("./fixtures/kbv-spec-v2.7-abbildung-3.xml", import.meta.url),
  "utf8"
).trim();
export const KBV_SPEC_V26_ABBILDUNG_3 = readFileSync(
  new URL("./fixtures/kbv-spec-v2.6-abbildung-3.xml", import.meta.url),
  "utf8"
).trim();
export const ABDA_SPEC_V23_ABBILDUNG_3 = readFileSync(
  new URL("./fixtures/abda-spec-v2.3-abbildung-3.xml", import.meta.url),
  "utf8"
).trim();

export const V28_OFFICIAL_STYLE =
  '<MP v="028" U="B556E9F99632438786B100B8D96C0122" l="de-DE"><P g="Michaela" f="Musterhausen" egk="B987563276" b="19361213" s="W" t="Dr." v="von" z="Freifrau"/><A lanr="123456667" n="Praxis 2" s="Hauptstraße 55" z="01234" c="Am Ort" p="04562-12345" e="mue@praxis-ueberall.de" t="2026-07-01T12:00:00"/><O ai="Penicillin" w="85" h="172" c="0.95"/><S><M f="Tabl" a="Ramipril Hexal" m="1" du="1" i="während der Mahlzeit" r="Bluthochdruck"><W w="Ramipril" s="5 mg"/></M><X t="Freitext mit Umlauten: äöüß"/><R t="Rezeptur 1" x="Nach Plan"/></S><S c="425"><M p="3159468" wo="1" m="1" du="1" i="Alkoholkonsum vermeiden" r="Rheuma"/></S><S c="411"><M p="16357856" t="max. 3" du="5" i="akut" r="Herzschmerzen"/></S></MP>';

export const V27_COMPATIBLE =
  '<MP v="027" U="A556E9F99632438786B100B8D96C0122" l="de-DE"><P g="Max" f="Müller" egk="A123456789" b="19600102" s="M"/><A idf="1234567" n="Apotheke Süd" s="Nebenstraße 3" z="23456" c="Berlin" p="030-123456" e="info@example.test" t="2026-06-01T09:30:00"/><S t="Selbstmedikation"><M a="Paracetamol" t="bei Bedarf" dud="Tabletten" r="Schmerzen"><W w="Paracetamol" s="500 mg"/></M></S></MP>';

export const MULTI_PAGE_1 =
  '<MP v="028" U="C556E9F99632438786B100B8D96C0122" a="1" z="2" l="de-DE"><P g="Erika" f="Mustermann" egk="C123456789" b="19440101" s="W"/><A kik="260000000" n="Klinik Mitte" s="Klinikweg 1" z="34567" c="Hamburg" t="2026-06-02T10:00:00"/><S c="412"><M a="Amlodipin" m="1" du="1" r="Blutdruck"><W w="Amlodipin" s="5 mg"/></M></S></MP>';

export const MULTI_PAGE_2 =
  '<MP v="028" U="C556E9F99632438786B100B8D96C0122" a="2" z="2" l="de-DE"><P g="Erika" f="Mustermann" egk="C123456789" b="19440101" s="W"/><A kik="260000000" n="Klinik Mitte" s="Klinikweg 1" z="34567" c="Hamburg" t="2026-06-02T10:00:00"/><S c="412"><M a="Bisoprolol" m="1" du="1" r="Herz"><W w="Bisoprolol" s="2.5 mg"/></M></S><S c="418"><M a="Magnesium" t="abends" dud="Brausetablette"/></S></MP>';

export const BARCODE_FIXTURES = [
  ["KBV v2.8 beispiel_1.xml", KBV_V28_BEISPIEL_1],
  ["KBV spec v2.7 Abbildung 3", KBV_SPEC_V27_ABBILDUNG_3],
  ["v2.8 official-style", V28_OFFICIAL_STYLE],
  ["v2.7 compatible", V27_COMPATIBLE],
  ["multi-page page 1", MULTI_PAGE_1],
  ["multi-page page 2", MULTI_PAGE_2]
];

export const LEGACY_BARCODE_FIXTURES = [
  ["KBV spec v2.6 Abbildung 3", KBV_SPEC_V26_ABBILDUNG_3],
  ["ABDA spec v2.3 Abbildung 3", ABDA_SPEC_V23_ABBILDUNG_3]
];
