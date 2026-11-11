import React from 'react';
import { motion } from 'framer-motion';

export function HeroHeadlineReveal({ text }) {
  const words = text.split(" ");
  return (
    <h1 className="hero-heading">
      {words.map((word, i) => {
        const isHighlight = word.toLowerCase().includes("pharmacy") || word.toLowerCase().includes("closest") || word.toLowerCase().includes("you");
        return (
          <span key={i} className="hero-reveal-word-wrap">
            <span className={`hero-reveal-word-bg ${isHighlight ? 'is-highlight' : ''}`}>{word}</span>
            <motion.span
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{
                duration: 0.75,
                delay: 0.25 + i * 0.22,
                ease: [0.25, 0.1, 0.25, 1.0],
              }}
              className={`hero-reveal-word-fg ${isHighlight ? 'is-highlight' : ''}`}
            >
              {word}
            </motion.span>
          </span>
        );
      })}
    </h1>
  );
}

export default HeroHeadlineReveal;
