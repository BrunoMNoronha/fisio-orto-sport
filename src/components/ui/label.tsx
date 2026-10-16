"use client"

import * as React from "react"
import { InformativeHelp } from "@/components/informative-help"
import { cn } from "cn"

function Label({ className, help, ...props }: React.ComponentProps<"label"> & { help?: string }) {
  const label = (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
  return help ? <InformativeHelp text={help}>{label}</InformativeHelp> : label
}

export { Label }
