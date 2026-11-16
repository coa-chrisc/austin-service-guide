import { useId } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import type { ImportConfig } from "./importApi";

interface Props {
  config: ImportConfig;
  busy: boolean;
  fileName: string | null;
  onFile: (file: File) => void;
}

export default function ImportUpload({ config, busy, fileName, onFile }: Props) {
  const inputId = useId();
  const limitsId = useId();
  return (
    <Box>
      <Typography component="label" htmlFor={inputId} variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 1 }}>
        Partner list file
      </Typography>
      <Typography id={limitsId} variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Accepted: {config.accepted.join(", ")}. Up to {config.max_file_mb} MB and {config.max_rows.toLocaleString()} rows.
        Macro-enabled and older Office files (.xlsm, .xls, .doc) are refused; save them as .xlsx, .csv or .docx first.
        Lists about residents (dates of birth, SSNs, case numbers) are refused. The file is read for this
        request only and is not stored on the server.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Button
          component="label"
          variant="contained"
          disableElevation
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
          disabled={busy}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {fileName ? "Choose another file" : "Choose a file"}
          <input
            id={inputId}
            type="file"
            hidden
            accept={config.accepted.join(",")}
            aria-describedby={limitsId}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </Button>
        {fileName && (
          <Typography variant="body2">
            Selected: <strong>{fileName}</strong>
          </Typography>
        )}
      </Box>
    </Box>
  );
}
