"use client";

// LazyMotion + `m` code-splits the framer-motion feature bundle out of the
// initial load, letting the pages that embed these stay Server Components.
import { LazyMotion, domAnimation, m, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <LazyMotion features={domAnimation}>
      <m.section
        className={className}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {children}
      </m.section>
    </LazyMotion>
  );
}

// Must be rendered inside <Stagger>.
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <m.div className={className} variants={itemVariants}>
      {children}
    </m.div>
  );
}

type RevealProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  delay?: number;
  y?: number;
  inView?: boolean;
};

export function Reveal({
  children,
  className,
  as = "div",
  delay = 0,
  y = 20,
  inView = false,
}: RevealProps) {
  const variants: Variants = {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay, ease: EASE } },
  };

  const animProps = inView
    ? ({
        initial: "hidden",
        whileInView: "visible",
        viewport: { once: true, margin: "-100px" },
      } as const)
    : ({ initial: "hidden", animate: "visible" } as const);

  const Comp = as === "section" ? m.section : m.div;

  return (
    <LazyMotion features={domAnimation}>
      <Comp className={className} variants={variants} {...animProps}>
        {children}
      </Comp>
    </LazyMotion>
  );
}
