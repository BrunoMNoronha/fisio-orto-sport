import Link from "next/link";
import type { ComponentProps } from "react";
import { InformativeHelp } from "./informative-help";

export function ActionLink({ help, ...props }: ComponentProps<typeof Link> & { help: string }) {
  return <InformativeHelp text={help} action><Link {...props} /></InformativeHelp>;
}
