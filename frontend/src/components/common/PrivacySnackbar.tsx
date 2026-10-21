import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

export const PII_REMOVED_MESSAGE =
  "To protect your privacy, personal identifiers like phone numbers or street addresses were removed before sending.";

export default function PrivacySnackbar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={8000}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="info" variant="filled" onClose={onClose}>
        {PII_REMOVED_MESSAGE}
      </Alert>
    </Snackbar>
  );
}
