"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  BookOpen,
  Highlighter,
  Server,
  ArrowRight,
} from "lucide-react";
import { Variants } from "framer-motion";

export default function Home() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <main className="min-h-screen bg-mesh-dark text-stone-100 relative flex flex-col items-center overflow-x-hidden selection:bg-[#ffd60a] selection:text-[#0f0f23]">
      {/* Navbar */}
      <nav className="w-full max-w-5xl mx-auto px-6 py-8 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shadow-sm border border-white/10">
            <Sparkles size={20} className="text-signature-gold" />
          </div>
          <span className="text-2xl font-serif italic tracking-tight font-medium text-stone-100">
            Sumly.
          </span>
        </div>
        <div className="flex gap-6 items-center">
          <a
            href="/docs"
            className="text-stone-400 hover:text-stone-100 transition font-medium text-sm flex items-center gap-2"
          >
            <BookOpen size={16} /> Documentation
          </a>
          <a
            href="https://github.com/thesongmartins/Sumly"
            className="text-stone-400 hover:text-stone-100 transition font-medium text-sm"
          >
            Github
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <motion.section
        className="flex-1 flex flex-col items-center justify-center text-center px-6 mt-16 z-10 max-w-3xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={itemVariants}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 text-xs font-medium text-stone-300 mb-8 border border-white/10 shadow-sm"
        >
          <span>Powered by Gemini 2.0</span>
        </motion.div>

        <motion.h1
          variants={itemVariants}
          className="font-serif text-5xl md:text-7xl font-normal tracking-tight mb-6 leading-[1.1] text-stone-100"
        >
          Understand any page in{" "}
          <i className="text-signature-gold font-serif">seconds.</i>
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="text-lg text-stone-400 mb-12 max-w-xl leading-relaxed font-sans"
        >
          A gentle open-source tool that reads the long articles for you,
          extracting beautiful insights and highlighting what actually matters.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 items-center"
        >
          <button className="flex items-center justify-center gap-2 bg-[#ffd60a] text-[#0f0f23] px-8 py-3.5 rounded-full font-medium hover:bg-[#e6c109] transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
            Install Extension
          </button>
          <a
            href="/docs"
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-medium text-stone-300 hover:text-stone-100 hover:bg-white/5 transition-all"
          >
            Read the Docs <ArrowRight size={18} />
          </a>
        </motion.div>
      </motion.section>

      {/* Features Grid */}
      <motion.section
        className="w-full max-w-5xl mx-auto px-6 py-28 z-10"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="grid md:grid-cols-3 gap-8">
          <div className="elegant-glass-card p-8 rounded-3xl flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-[#ffd60a]/10 flex items-center justify-center text-signature-gold mb-2 border border-[#ffd60a]/20">
              <Sparkles size={24} />
            </div>
            <h3 className="font-serif text-2xl text-stone-100">
              Clear Insights
            </h3>
            <p className="text-stone-400 leading-relaxed text-sm font-sans">
              No more skimming. Get 4-6 perfectly crafted bullet points and deep
              thematic takeaways from any lengthy text.
            </p>
          </div>

          <div className="elegant-glass-card p-8 rounded-3xl flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-stone-300 mb-2 border border-white/10">
              <Highlighter size={24} />
            </div>
            <h3 className="font-serif text-2xl text-stone-100">
              In-text Highlights
            </h3>
            <p className="text-stone-400 leading-relaxed text-sm font-sans">
              Watch as the AI physically highlights the most important sentences
              directly on your webpage.
            </p>
          </div>

          <div className="elegant-glass-card p-8 rounded-3xl flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2 border border-emerald-500/20">
              <Server size={24} />
            </div>
            <h3 className="font-serif text-2xl text-stone-100">
              Local Privacy
            </h3>
            <p className="text-stone-400 leading-relaxed text-sm font-sans">
              Your API keys stay strictly on your local machine. We securely
              proxy all requests so nothing leaks.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Floating Status Widget */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="elegant-glass px-5 py-3.5 rounded-full flex items-center gap-3">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>
          <span className="text-xs font-medium text-stone-300 tracking-wide uppercase">
            Proxy Running
          </span>
        </div>
      </motion.div>

      {/* Soft background glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#ffd60a]/5 blur-[120px] pointer-events-none z-0"></div>
    </main>
  );
}
