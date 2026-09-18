import Image from "next/image"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/ortosport-mark.svg"
      alt=""
      width={32}
      height={32}
      className={cn("size-8", className)}
    />
  )
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      <span className="text-brand-navy">Orto</span>
      <span className="text-brand-green">Sport</span>
    </span>
  )
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandMark className="size-12" />
      <div className="grid leading-tight">
        <BrandWordmark className="text-3xl" />
        <span className="text-[0.6rem] font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Fisioterapia especializada
        </span>
      </div>
    </div>
  )
}
