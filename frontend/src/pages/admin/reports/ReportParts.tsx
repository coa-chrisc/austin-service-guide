/** Building blocks for the printable reports: sections, stats, tables, notes. */
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

export function ReportSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box component="section" className="report-section" sx={{ mb: 3 }}>
      <Typography
        variant="h6"
        component="h2"
        fontWeight={700}
        sx={{
          fontSize: "1.05rem",
          borderBottom: "2px solid",
          borderColor: "primary.main",
          pb: 0.5,
          mb: note ? 0.75 : 1.5,
        }}
      >
        {title}
      </Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {note}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export interface StatItem {
  label: string;
  value: string;
  detail?: string;
}

export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <Box
      className="report-section"
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 1.5,
        mb: 3,
      }}
    >
      {items.map((item) => (
        <Box
          key={item.label}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderTop: "4px solid",
            borderTopColor: "primary.main",
            borderRadius: 1,
            px: 1.5,
            py: 1.25,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            sx={{ display: "block", lineHeight: 1.3 }}
          >
            {item.label}
          </Typography>
          <Typography
            variant="h5"
            fontWeight={800}
            sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
          >
            {item.value}
          </Typography>
          {item.detail && (
            <Typography variant="caption" color="text.secondary">
              {item.detail}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

export interface Column {
  label: string;
  numeric?: boolean;
  width?: string;
}

export function ReportTable({
  columns,
  rows,
}: {
  columns: Column[];
  rows: ReactNode[][];
}) {
  return (
    <Table
      size="small"
      sx={{
        "& th": { fontWeight: 700, bgcolor: "action.hover" },
        "& td, & th": {
          px: 1,
          py: 0.6,
          fontSize: "0.8rem",
          fontVariantNumeric: "tabular-nums",
        },
      }}
    >
      <TableHead>
        <TableRow>
          {columns.map((c) => (
            <TableCell
              key={c.label}
              align={c.numeric ? "right" : "left"}
              sx={c.width ? { width: c.width } : undefined}
            >
              {c.label}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, k) => (
              <TableCell key={k} align={columns[k]?.numeric ? "right" : "left"}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {items.map((item, i) => (
        <Typography key={i} component="li" variant="body2" sx={{ mb: 0.5 }}>
          {item}
        </Typography>
      ))}
    </Box>
  );
}

/** The closing "Methods and limitations" box every report carries. */
export function MethodsBox({ items }: { items: ReactNode[] }) {
  return (
    <Box
      component="section"
      className="report-section"
      sx={{
        mt: 2,
        p: 2,
        border: "1px solid",
        borderColor: "divider",
        borderLeft: "4px solid",
        borderLeftColor: "secondary.main",
        borderRadius: 1,
        bgcolor: "action.hover",
      }}
    >
      <Typography
        variant="subtitle1"
        component="h2"
        fontWeight={700}
        sx={{ mb: 1 }}
      >
        Methods and limitations
      </Typography>
      <BulletList items={items} />
    </Box>
  );
}
