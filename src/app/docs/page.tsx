"use client";

import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Key, Download, Settings } from "lucide-react";
import Link from "next/link";

export default function Docs() {
  return (
    <main className="min-h-screen bg-mesh-dark text-stone-100 font-sans selection:bg-[#ffd60a] selection:text-[#0f0f23] pb-20">
      {/* Navbar */}
      <nav className="w-full max-w-3xl mx-auto px-6 py-8 flex justify-between items-center">
        <Link
          href="/"
          className="flex items-center gap-2 text-stone-400 hover:text-stone-100 transition font-medium text-sm"
        >
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <span className="font-serif italic text-xl font-medium text-stone-300">
          Sumly.
        </span>
      </nav>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 mt-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="font-serif text-4xl md:text-5xl font-normal tracking-tight mb-4 text-stone-100">
            Documentation
          </h1>
          <p className="text-lg text-stone-400 mb-12 leading-relaxed font-sans">
            Everything you need to know to set up and use the Sumly Chrome
            Extension securely on your local machine.
          </p>

          <hr className="border-white/10 mb-12" />

          {/* Section 1 */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-4">
              <Download size={20} className="text-stone-400" />
              <h2 className="font-serif text-2xl text-stone-100">
                1. Install the Extension
              </h2>
            </div>
            <p className="text-stone-400 mb-4 leading-relaxed font-sans">
              Because Sumly is an open-source tool, you will install it directly
              into your browser using Developer Mode.
            </p>
            <ol className="list-decimal list-inside space-y-3 text-stone-300 elegant-glass-card p-6 rounded-2xl">
              <li>
                Open Google Chrome and navigate to{" "}
                <code className="bg-white/10 px-2 py-1 rounded text-sm text-stone-200">
                  chrome://extensions
                </code>
              </li>
              <li>
                Toggle <strong>"Developer mode"</strong> in the top right
                corner.
              </li>
              <li>
                Click <strong>"Load unpacked"</strong> in the top left.
              </li>
              <li>
                Select the{" "}
                <code className="bg-white/10 px-2 py-1 rounded text-sm text-stone-200">
                  extension
                </code>{" "}
                folder located inside the Sumly repository.
              </li>
            </ol>
          </section>

          {/* Section 2 */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-4">
              <Key size={20} className="text-stone-400" />
              <h2 className="font-serif text-2xl text-stone-100">
                2. Setup API Key
              </h2>
            </div>
            <p className="text-stone-400 mb-4 leading-relaxed font-sans">
              Sumly uses Google's powerful Gemini 2.0 Flash model. You need your
              own API key to power the extension.
            </p>
            <div className="elegant-glass-card p-6 rounded-2xl space-y-4 text-stone-300 font-sans">
              <p>
                First, visit{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  className="text-signature-gold hover:text-[#e6c109] underline underline-offset-4 transition"
                >
                  Google AI Studio
                </a>{" "}
                and create a new API key.
              </p>
              <p>
                Then, in your project folder, copy the example environment file:
              </p>
              <pre className="bg-[#0f0f23] text-stone-300 p-4 rounded-xl text-sm overflow-x-auto border border-white/10">
                <code>cp .env.example .env.local</code>
              </pre>
              <p>
                Open{" "}
                <code className="bg-white/10 px-2 py-1 rounded text-sm text-stone-200">
                  .env.local
                </code>{" "}
                and paste your key:
              </p>
              <pre className="bg-[#0f0f23] text-stone-300 p-4 rounded-xl text-sm overflow-x-auto border border-white/10">
                <code>GEMINI_API_KEY=your_key_here</code>
              </pre>
              <div className="bg-[#ffd60a]/10 border border-[#ffd60a]/20 p-4 rounded-xl text-sm text-stone-200 flex gap-3 mt-2">
                <div className="font-bold text-xl mt-[-2px] text-signature-gold">
                  !
                </div>
                <p>
                  <strong>Note:</strong> We highly recommend setting up a
                  billing account in Google Cloud to remove the strict
                  30-requests-per-minute free tier limit.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-4">
              <Settings size={20} className="text-stone-400" />
              <h2 className="font-serif text-2xl text-stone-100">
                3. Start the Local Server
              </h2>
            </div>
            <p className="text-stone-400 mb-4 leading-relaxed font-sans">
              To keep your API key secure, the extension sends requests to a
              local Next.js proxy server running on your machine, which then
              securely talks to Google.
            </p>
            <div className="elegant-glass-card p-6 rounded-2xl font-sans">
              <pre className="bg-[#0f0f23] text-stone-300 p-4 rounded-xl text-sm overflow-x-auto border border-white/10">
                <code>pnpm run dev</code>
              </pre>
              <p className="text-sm text-stone-400 mt-4">
                Leave this server running in your terminal while using the
                extension. It runs silently on{" "}
                <code className="bg-white/10 px-1 py-0.5 rounded text-stone-200">
                  localhost:3000
                </code>
                .
              </p>
            </div>
          </section>

          <hr className="border-white/10 mb-12" />

          <p className="text-center text-stone-400 font-serif italic text-lg">
            You're all set! Open any article online and click the Sumly icon to
            read faster.
          </p>
        </motion.div>
      </article>
    </main>
  );
}
