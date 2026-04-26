import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { IntakeMessage } from "@/types";

interface ChatBubbleProps {
  message: IntakeMessage;
  onButtonClick?: (value: string) => void;
  isLatest?: boolean;
}

export default function ChatBubble({
  message,
  onButtonClick,
  isLatest,
}: ChatBubbleProps) {
  const isUser = message.role === "user";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 1.5,
        mb: 2,
        "@media (prefers-reduced-motion: no-preference)": {
          animation: "fadeSlideIn 0.3s ease-out",
          "@keyframes fadeSlideIn": {
            from: { opacity: 0, transform: "translateY(8px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
        },
      }}
    >
      {/* Avatar */}
      {!isUser && (
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: "primary.main",
            mt: 0.5,
          }}
        >
          <SmartToyIcon sx={{ fontSize: 20 }} />
        </Avatar>
      )}

      {/* Bubble */}
      <Box sx={{ maxWidth: "75%", minWidth: 60 }}>
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            bgcolor: isUser ? "primary.main" : "grey.100",
            color: isUser ? "primary.contrastText" : "text.primary",
            ...(isUser
              ? {}
              : {
                  border: "1px solid",
                  borderColor: "divider",
                }),
          }}
        >
          {isUser ? (
            <Typography
              variant="body1"
              sx={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.6,
                fontSize: "0.95rem",
              }}
            >
              {message.content}
            </Typography>
          ) : (
            <Box
              sx={{
                fontSize: "0.95rem",
                lineHeight: 1.6,
                wordBreak: "break-word",
                "& p": { my: 0.5 },
                "& p:first-of-type": { mt: 0 },
                "& p:last-of-type": { mb: 0 },
                "& ul, & ol": { my: 0.5, pl: 3 },
                "& li": { my: 0.25 },
                "& li > p": { my: 0 },
                "& strong": { fontWeight: 700 },
                "& em": { fontStyle: "italic" },
                "& code": {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                  fontSize: "0.875em",
                  bgcolor: "rgba(0,0,0,0.06)",
                  px: 0.5,
                  borderRadius: "3px",
                },
                "& pre": {
                  bgcolor: "rgba(0,0,0,0.06)",
                  p: 1,
                  borderRadius: 1,
                  overflowX: "auto",
                },
                "& a": {
                  color: "primary.main",
                  textDecoration: "underline",
                },
                "& h1, & h2, & h3": {
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  my: 1,
                },
                "& blockquote": {
                  borderLeft: "3px solid",
                  borderColor: "primary.light",
                  pl: 1.5,
                  ml: 0,
                  my: 0.5,
                  color: "text.secondary",
                },
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node: _node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </Box>
          )}
        </Box>

        {/* Suggested buttons */}
        {!isUser &&
          isLatest &&
          message.suggested_buttons &&
          message.suggested_buttons.length > 0 && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.75,
                mt: 1.5,
                "@media (prefers-reduced-motion: no-preference)": {
                  animation: "fadeSlideIn 0.4s ease-out 0.15s both",
                },
              }}
            >
              {message.suggested_buttons.map((btn) => (
                <Chip
                  key={btn}
                  label={btn}
                  onClick={() => onButtonClick?.(btn)}
                  clickable
                  variant="outlined"
                  color="primary"
                  sx={{
                    fontWeight: 500,
                    borderRadius: "20px",
                    "&:hover": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                    },
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </Box>
          )}
      </Box>
    </Box>
  );
}
