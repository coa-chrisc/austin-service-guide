import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { AboutInfo } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Live values from GET /api/v1/about, per section. Nothing here is   */
/*  hard-coded: model, effort, voice mode, tools, redaction kinds,     */
/*  limits and counts all come from the running server.                */
/* ------------------------------------------------------------------ */

/** Plain names for the server's redaction kinds (pii.PLACEHOLDERS keys). Unknown kinds show their key. */
const PII_KIND_LABELS: Record<string, string> = {
  email: "Email addresses",
  card: "Payment card numbers",
  ssn: "Social Security Numbers (SSN) and ITINs",
  id_number: "Member, case, or account IDs following labels like \"member\" or \"account\"",
  dob: "Dates of birth following cues like \"born\" or \"DOB\"",
  phone: "US phone numbers",
  address: "Street addresses and P.O. boxes",
  name: "Names following \"my name is\", or two to three capitalized words after \"I am\" or \"this is\"",
};

const n = (value: number) => value.toLocaleString("en-US");
const yesNo = (value: boolean) => (value ? "yes" : "no");

function aiStatus(a: AboutInfo): string {
  return a.live_ai
    ? `Live AI active. Text model: ${a.text_model} (reasoning effort: ${a.reasoning_effort}). Action plan ranking: reasoning effort ${a.plan_reasoning_effort}. Max ${n(a.max_tool_iterations)} tool rounds per turn.`
    : "Live AI paused. Deterministic scripted intake is active; zero external model calls occur.";
}

function voiceStatus(a: AboutInfo): string {
  return a.voice.mode === "realtime_audio"
    ? `Voice mode: streaming audio via OpenAI Realtime API (model: ${a.voice.realtime_model ?? "not reported"}).`
    : "Voice mode: on-device browser speech-to-text; only scrubbed text leaves the device.";
}

function catalogStatus(a: AboutInfo): string {
  const verified = a.catalog.services_verified == null ? "not recorded" : n(a.catalog.services_verified);
  return `Vetted directory: ${n(a.catalog.services_total)} programs across ${n(a.catalog.categories)} categories. Records with logged staff verification: ${verified}.`;
}

/** The fact lines for one section; empty when the section has none. */
export function factsFor(sectionId: string, a: AboutInfo): string[] {
  switch (sectionId) {
    case "summary":
      return [`This page describes ${a.app_name}.`, aiStatus(a), voiceStatus(a), catalogStatus(a)];
    case "what-this-is":
      return [`Name: ${a.app_name}.`, `Access code needed to open the site: ${yesNo(a.access_gate)}.`];
    case "ai-model":
      return [
        aiStatus(a),
        ...(a.live_ai ? [] : [`Model the server would use with a key: ${a.text_model}.`]),
        `Text agent tools: ${a.tools.join(", ")}.`,
        voiceStatus(a),
      ];
    case "pii":
      return a.pii_kinds.map((kind) => PII_KIND_LABELS[kind] ?? kind);
    case "stateless":
      return [
        `Largest intake request: ${n(Math.round(a.limits.intake_body_bytes / 1024))} KiB.`,
        `Stored conversation: up to ${n(a.limits.state_messages)} messages of up to ${n(a.limits.message_chars)} characters each.`,
        ...(a.limits.new_message_chars == null ? [] : [`New message: up to ${n(a.limits.new_message_chars)} characters.`]),
      ];
    case "safety":
      return [catalogStatus(a)];
    case "crisis":
      return [
        `Local crisis lines in this data pack: ${n(a.catalog.local_crisis_lines)}, shown with 988, 9-1-1 and the National Domestic Violence Hotline.`,
      ];
    case "status":
      return [
        `Access-code gate: ${a.access_gate ? "on" : "off"}.`,
        `Staff catalog edits kept after a restart: ${yesNo(a.admin.catalog_writes_persist)}.`,
      ];
    default:
      return [];
  }
}

/** `headingLevel`: h4 inside a section (the default); h3 for the page-wide summary above the sections. */
export default function LiveFacts({
  sectionId,
  about,
  headingLevel = "h4",
}: {
  sectionId: string;
  about: AboutInfo;
  headingLevel?: "h3" | "h4";
}) {
  const facts = factsFor(sectionId, about);
  if (!facts.length) return null;
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.default",
        p: 2,
        my: 2,
      }}
    >
      <Typography component={headingLevel} variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {sectionId === "pii" ? "Scrubbed on this deployment" : "Live runtime config"}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {facts.map((fact) => (
          <Typography component="li" variant="body2" key={fact} sx={{ overflowWrap: "anywhere" }}>
            {fact}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
