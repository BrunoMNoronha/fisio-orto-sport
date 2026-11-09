"use client";

// Carrega o tour só quando o servidor decidiu mostrá-lo: quem já viu não baixa o chunk.
// `ssr: false` só funciona dentro de Client Component, por isso este wrapper existe.
import dynamic from "next/dynamic";

const HomeTour = dynamic(() => import("./home-tour").then((module) => module.HomeTour), {
  ssr: false,
  loading: () => null,
});

export function HomeTourLoader({ showTour }: { showTour: boolean }) {
  return showTour ? <HomeTour /> : null;
}
