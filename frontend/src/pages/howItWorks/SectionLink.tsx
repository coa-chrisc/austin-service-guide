import type { MouseEvent } from "react";
import Link from "@mui/material/Link";
import { SECTIONS } from "./content";

/** Moves to a section in place (focus and scroll), without a reload. */
export type JumpHandler = (event: MouseEvent<HTMLAnchorElement>, id: string) => void;

const TITLE_BY_ID = new Map(SECTIONS.map((s) => [s.id, s.title]));

/** A link to a section, labelled with the section's title unless a label is given. */
export default function SectionLink({ id, onJump, label }: { id: string; onJump: JumpHandler; label?: string }) {
  return (
    <Link href={`#${id}`} onClick={(e) => onJump(e, id)}>
      {label ?? TITLE_BY_ID.get(id) ?? id}
    </Link>
  );
}
