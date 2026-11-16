import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { Draft, DraftService } from "./importApi";
import type { Decision } from "./reviewItems";

interface Props {
  draft: Draft;
  service: DraftService;
  decision: Decision;
  /** Errors from the last server check, or undefined when not checked since the last edit. */
  checkedErrors?: string[];
  edited: boolean;
  onDecision: (decision: Decision) => void;
  onEdit: (service: DraftService) => void;
}

const TEXT_FIELDS: Array<[keyof DraftService & string, string, boolean]> = [
  ["name", "Service name", false],
  ["provider_name", "Organisation", false],
  ["phone", "Main phone", false],
  ["website_url", "Website", false],
  ["email", "Public email", false],
  ["description", "Description", true],
  ["eligibility_summary", "Who qualifies", true],
];

export default function DraftCard({ draft, service, decision, checkedErrors, edited, onDecision, onEdit }: Props) {
  const [showRows, setShowRows] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState("");
  const errors =
    checkedErrors ?? (edited ? [] : draft.errors.map((e) => `${e.path ? `${e.path}: ` : ""}${e.message}`));
  const rows = draft.provenance.rows.join(", ");
  const titleId = `draft-${draft.key}-title`;

  const setField = (key: string, value: string) => {
    const next: DraftService = { ...service };
    if (value || key === "name" || key === "provider_name") next[key] = value;
    else delete next[key];
    onEdit(next);
  };

  return (
    <Card variant="outlined" component="section" aria-labelledby={titleId}>
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
          <Box>
            <Typography id={titleId} variant="h6" component="h3" fontWeight={700}>
              {service.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {service.provider_name} · {draft.provenance.sheet}, row{draft.provenance.rows.length > 1 ? "s" : ""} {rows}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              {draft.grouped && <Chip size="small" label={`Combined from ${draft.provenance.rows.length} rows`} />}
              <Chip
                size="small"
                label={edited && !checkedErrors ? "Edited, not checked" : errors.length ? `${errors.length} error(s)` : "No errors"}
                color={errors.length ? "error" : "default"}
              />
              {draft.duplicates.length > 0 && <Chip size="small" color="warning" label="Possible duplicate in the pack" />}
              {draft.duplicate_in_file.length > 0 && <Chip size="small" color="warning" label="Similar to another row" />}
            </Stack>
          </Box>
          <RadioGroup
            aria-label={`Decision for ${service.name}`}
            value={decision.action}
            onChange={(e) => {
              const action = e.target.value as Decision["action"];
              onDecision(action === "merge" ? { action, target: draft.duplicates[0]?.slug ?? "" } : ({ action } as Decision));
            }}
          >
            <FormControlLabel value="pending" control={<Radio size="small" />} label="Not decided" />
            <FormControlLabel value="accept" control={<Radio size="small" />} label="Accept as a new entry" />
            <FormControlLabel value="merge" control={<Radio size="small" />} label="Merge into an existing entry" />
            <FormControlLabel value="reject" control={<Radio size="small" />} label="Reject" />
          </RadioGroup>
        </Stack>

        {decision.action === "merge" && (
          <TextField
            select={draft.duplicates.length > 0}
            size="small"
            label="Existing entry (slug)"
            value={decision.target}
            onChange={(e) => onDecision({ action: "merge", target: e.target.value.trim() })}
            helperText="The existing id and slug are kept; only its empty fields are filled and new locations added."
            sx={{ mt: 1, minWidth: 300 }}
          >
            {draft.duplicates.map((d) => (
              <MenuItem key={d.slug} value={d.slug}>
                {d.name} ({d.slug})
              </MenuItem>
            ))}
          </TextField>
        )}

        {draft.duplicates.length > 0 && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Matches in the pack:{" "}
            {draft.duplicates.map((d) => `${d.name} (${d.slug}; same ${d.reasons.join(", ")})`).join("; ")}
          </Typography>
        )}

        {errors.length > 0 && (
          <Box sx={{ mt: 1 }} role="alert">
            {errors.map((e, i) => (
              <Typography key={i} variant="body2" color="error">
                Error: {e}
              </Typography>
            ))}
          </Box>
        )}
        {draft.flags.length > 0 && (
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 3 }}>
            {draft.flags.map((f) => (
              <Typography component="li" key={f.code} variant="body2">
                {f.message}
              </Typography>
            ))}
          </Box>
        )}
        {draft.suggestions.length > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Suggested by the import, not stated in the list (check these): {draft.suggestions.join(", ")}
          </Typography>
        )}

        <Box sx={{ display: "grid", gap: 1.5, mt: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          {TEXT_FIELDS.map(([key, label, multiline]) => (
            <TextField
              key={key}
              size="small"
              label={label}
              value={typeof service[key] === "string" ? (service[key] as string) : ""}
              onChange={(e) => setField(key, e.target.value)}
              multiline={multiline}
              minRows={multiline ? 2 : undefined}
            />
          ))}
        </Box>

        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button size="small" onClick={() => setShowRows((v) => !v)} sx={{ textTransform: "none", fontWeight: 600 }}>
            {showRows ? "Hide source rows" : "Show source rows"}
          </Button>
          <Button
            size="small"
            onClick={() => {
              setJson(json === null ? JSON.stringify(service, null, 2) : null);
              setJsonError("");
            }}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {json === null ? "Edit the full record" : "Close the full record"}
          </Button>
        </Stack>

        <Collapse in={showRows}>
          {draft.source_rows.map((r) => (
            <Box key={r.row} sx={{ mt: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                Row {r.row} (included columns, after filtering)
              </Typography>
              {r.cells.map((c, i) => (
                <Typography key={i} variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  {c.header}: {c.value || "(removed or empty)"}
                </Typography>
              ))}
            </Box>
          ))}
        </Collapse>

        {json !== null && (
          <Box sx={{ mt: 1 }}>
            <TextField
              fullWidth
              multiline
              minRows={8}
              label="Full record (JSON, data-pack fields)"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              error={Boolean(jsonError)}
              helperText={jsonError || "Categories, locations and hours are edited here."}
              slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "monospace", fontSize: 13 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              sx={{ mt: 1, textTransform: "none", fontWeight: 600 }}
              onClick={() => {
                try {
                  const parsed = JSON.parse(json) as unknown;
                  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
                  onEdit(parsed as DraftService);
                  setJsonError("");
                  setJson(null);
                } catch {
                  setJsonError("This is not a valid JSON object.");
                }
              }}
            >
              Apply
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
