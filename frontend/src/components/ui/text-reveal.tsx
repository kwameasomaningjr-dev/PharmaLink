"use client";

import React, { FC, ReactNode, useRef } from "react";
import { motion, MotionValue, useScroll, useTransform } from "framer-motion";
import { cn } from "../../lib/utils";

interface TextRevealByWordProps {
  text: string;
  className?: string;
}

const TextRevealByWord: FC<TextRevealByWordProps> = ({
  text,
  className,
}) => {
  const targetRef = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"]
  });
  const words = text.split(" ");

  return (
    <div ref={targetRef} className={cn("text-reveal-wrapper", className)}>
      <div className="text-reveal-sticky">
        <p className="text-reveal-paragraph">
          {words.map((word, i) => {
            const start = i / words.length;
            const end = start + 1 / words.length;
            return (
              <Word key={i} progress={scrollYProgress} range={[start, end]}>
                {word}
              </Word>
            );
          })}
        </p>
      </div>
    </div>
  );
};

interface WordProps {
  children: ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
}

const Word: FC<WordProps> = ({ children, progress, range }) => {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <span className="text-reveal-word-container">
      <span className="text-reveal-word-bg">{children}</span>
      <motion.span style={{ opacity }} className="text-reveal-word-fg">
        {children}
      </motion.span>
    </span>
  );
};

export { TextRevealByWord };
