import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

import type { ServiceDocument } from "@/types";

interface Props {
  documents: ServiceDocument[];
  onChange: (documents: ServiceDocument[]) => void;
}

export default function DocumentsTab({ documents, onChange }: Props) {
  const update = (idx: number, patch: Partial<ServiceDocument>) =>
    onChange(documents.map((doc, i) => (i === idx ? { ...doc, ...patch } : doc)));

  return (
    <Box>
      {documents.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No required documents yet.
        </Typography>
      )}
      {documents.map((doc, idx) => (
        <Box key={idx} sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Document {idx + 1}
            </Typography>
            <IconButton
              size="small"
              color="error"
              onClick={() => onChange(documents.filter((_, i) => i !== idx))}
              aria-label={`Remove document ${idx + 1}`}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField fullWidth size="small" label="Document name" value={doc.name} onChange={(e) => update(idx, { name: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                size="small"
                label="Description"
                value={doc.description}
                onChange={(e) => update(idx, { description: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <FormControlLabel
                control={<Switch checked={doc.is_required} onChange={(e) => update(idx, { is_required: e.target.checked })} />}
                label="Required"
              />
            </Grid>
          </Grid>
          {idx < documents.length - 1 && <Divider sx={{ mt: 2 }} />}
        </Box>
      ))}
      <Button
        startIcon={<AddIcon />}
        variant="outlined"
        onClick={() => onChange([...documents, { name: "", description: "", is_required: true }])}
      >
        Add document
      </Button>
    </Box>
  );
}
