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
  ssn: "Social Security and ITIN numbers",
  id_number: "ID, member or account numbers after a word like \"member\" or \"account\"",
  dob: "Dates of birth after a word like \"born\" or \"DOB\"",
  phone: "US phone numbers",
  address: "Street addresses and P.O. boxes",
  name: "Names after \"my name is\", or two or three capitalized words after \"I am\" or \"this is\"",
};

const n = (value: number) => value.toLocaleString("en-US");
const yesNo = (value: boolean) => (value ? "yes" : "no");

function aiStatus(a: AboutInfo): string {
  return a.live_ai
    ? `Live AI is on. Text model: ${a.text_model}, reasoning effort ${a.reasoning_effort}. Plan ordering: reasoning effort ${a.plan_reasoning_effort}. Up to ${n(a.max_tool_iterations)} tool rounds per message.`
    : "Live AI is off. The scripted question flow is active and no AI model is called.";
}

function voiceStatus(a: AboutInfo): string {
  return a.voice.mode === "realtime_audio"
    ? `Voice mode: raw audio streamed to the OpenAI Realtime API (model ${a.voice.realtime_model ?? "not reported"}).`
    : "Voice mode: speech to text on your device; only text is sent.";
}

function catalogStatus(a: AboutInfo): string {
  const verified = a.catalog.services_verified == null ? "not recorded" : n(a.catalog.services_verified);
  return `Services listed: ${n(a.catalog.services_total)} in ${n(a.catalog.categories)} categories. Services with a recorded staff check: ${verified}.`;
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
    case "grounding":
      return [catalogStatus(a)];
    case "crisis":
      return [
        `Local crisis lines in this data pack: ${n(a.catalog.local_crisis_lines)}, shown with 988, 9-1-1 and the National Domestic Violence Hotline.`,
      ];
    case "security":
      return [
        `Access-code gate: ${a.access_gate ? "on" : "off"}.`,
        `Staff catalog edits kept after a restart: ${yesNo(a.admin.catalog_writes_persist)}.`,
      ];
    default:
      return [];
  }
}

export default function LiveFacts({ sectionId, about }: { sectionId: string; about: AboutInfo }) {
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
      <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {sectionId === "pii" ? "Removed on this deployment" : "On this deployment"}
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
