import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

function CornerPlus() {
  return (
    <>
      <span className="absolute -top-3.5 -left-1.5 text-neutral-300 font-mono text-xl pointer-events-none select-none">+</span>
      <span className="absolute -top-3.5 -right-1.5 text-neutral-300 font-mono text-xl pointer-events-none select-none">+</span>
      <span className="absolute -bottom-3.5 -left-1.5 text-neutral-300 font-mono text-xl pointer-events-none select-none">+</span>
      <span className="absolute -bottom-3.5 -right-1.5 text-neutral-300 font-mono text-xl pointer-events-none select-none">+</span>
    </>
  );
}

function SectionDivider() {
  return <div className="h-8 bg-diagonal-stripes border-y border-[#ededed] w-full" />;
}

const logos = [
  "https://framerusercontent.com/images/WWMCBTyiJptmzGSZcH82wUzJdk.svg",
  "https://framerusercontent.com/images/dDxw8IGpaGwYdREDXbEjVNp9OPY.svg",
  "https://framerusercontent.com/images/dMltwHCGTaFuvvDeauBbNw4VhiE.svg",
  "https://framerusercontent.com/images/ib7QEOHnNoY5ZmEBYTIPQQuuY.svg",
  "https://framerusercontent.com/images/CEP27u2CV5mni8P2MYdJREE8JiY.svg",
  "https://framerusercontent.com/images/1la3JOHvXJ7sFkm0oA4c5kVwZ80.svg",
  "https://framerusercontent.com/images/a4ImMXl9VpSeOL8aL5DT3KPWqU.svg"
];

const capabilities = [
  { step: '01', title: 'Source', description: 'Research suppliers in real time and compare alternatives against budget, risk, and delivery needs.' },
  { step: '02', title: 'Negotiate', description: 'Use AI-powered negotiation to push for better pricing, payment terms, and substitutions.' },
  { step: '03', title: 'Approve', description: 'Route requests through HITL gates with clear evidence, policy context, and spend ownership.' },
  { step: '04', title: 'Create POs', description: 'Generate purchase orders from approved requests and keep every decision traceable.' },
  { step: '05', title: 'Match invoices', description: 'Read invoices with OCR and run a 3-way match against POs, receipts, and policy rules.' },
  { step: '06', title: 'Remember', description: 'Carry institutional knowledge across sessions so repeat buys get faster and smarter.' },
];

function IntegrationsGraph() {
  return (
    <div className="relative max-w-[700px] mx-auto h-[450px] flex items-center justify-between my-12 px-6">
      {/* Left Column */}
      <div className="flex flex-col justify-between h-full py-4 z-10">
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#E01E5A] font-space font-semibold text-xs">Slack</span>
        </div>
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#635BFF] font-space font-semibold text-xs">Stripe</span>
        </div>
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#FF7A59] font-space font-semibold text-xs">HubSpot</span>
        </div>
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#00A4E4] font-space font-semibold text-xs">Salesforce</span>
        </div>
      </div>

      {/* SVG Connecting Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#ededed] stroke-[1] fill-none">
        {/* Paths connecting left column to center */}
        <path d="M 130 60 Q 240 60, 350 225" />
        <path d="M 130 170 Q 240 170, 350 225" />
        <path d="M 130 280 Q 240 280, 350 225" />
        <path d="M 130 390 Q 240 390, 350 225" />

        {/* Paths connecting right column to center */}
        <path d="M 570 60 Q 460 60, 350 225" />
        <path d="M 570 170 Q 460 170, 350 225" />
        <path d="M 570 280 Q 460 280, 350 225" />
        <path d="M 570 390 Q 460 390, 350 225" />
      </svg>

      {/* Center Node */}
      <div className="w-24 h-24 bg-[#191919] border border-neutral-800 shadow-2xl flex items-center justify-center relative">
        <img src="/procurely-icon.svg" className="h-10 w-10 filter invert" alt="Procurely" />
        <div className="absolute inset-0 border border-neutral-700 animate-ping opacity-10" />
      </div>

      {/* Right Column */}
      <div className="flex flex-col justify-between h-full py-4 z-10">
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#2CA01C] font-space font-semibold text-xs">QuickBooks</span>
        </div>
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#008CD1] font-space font-semibold text-xs">NetSuite</span>
        </div>
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#008FD3] font-space font-semibold text-xs">SAP</span>
        </div>
        <div className="flex items-center justify-center bg-white border border-[#ededed] p-3 shadow-xs hover:scale-105 transition-transform w-[130px] rounded-none">
          <span className="text-[#13B5EA] font-space font-semibold text-xs">Xero</span>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-[#737373] font-sans selection:bg-neutral-200 selection:text-[#191919]">
      {/* Navigation */}
      <nav className="fixed top-4 w-[90%] max-w-[1224px] z-50 bg-[#fcfcfc]/80 backdrop-blur-md border border-[#efefef] rounded-none left-1/2 -translate-x-1/2 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/procurely-icon.svg" alt="Procurely" className="h-6 w-6" />
          <span className="font-space font-bold text-lg text-[#191919]">Procurely</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-space">
          <a href="#features" className="hover:text-[#191919] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 rounded-xs">Features</a>
          <a href="#how-it-works" className="hover:text-[#191919] transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-[#191919] transition-colors">Pricing</a>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="bg-[#191919] text-white font-space px-5 py-2.5 text-sm font-semibold hover:bg-black transition-colors rounded-none border border-[#191919] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
        >
          Get Started
        </button>
      </nav>

      {/* Hero */}
      <section className="relative max-w-[1224px] mx-auto border-x border-[#ededed] pt-24 pb-16 px-6 md:px-12 text-center">
        <CornerPlus />
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 15 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5 }}
          className="inline-flex items-center gap-2 bg-[#f4f4f4] border border-[#ededed] rounded-full px-4 py-1.5 text-xs text-[#636363] font-space font-medium mb-8"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#191919]" />
          AI procurement agent for mid-market teams
        </motion.div>
        <motion.h1 
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-7xl font-sans font-light text-[#191919] tracking-[-0.03em] leading-none mb-6 max-w-4xl mx-auto"
        >
          Procurement that runs itself
        </motion.h1>
        <motion.p 
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.2 }}
          className="text-lg text-[#737373] max-w-2xl mx-auto mb-10 leading-relaxed font-sans"
        >
          Procurely turns one natural language request into supplier sourcing, AI price negotiation, purchase orders, and invoice matching, cutting procurement cycles from weeks to minutes.
        </motion.p>
        <motion.div 
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.3 }}
          className="flex items-center justify-center gap-4"
        >
          <button
            onClick={() => navigate('/login')}
            className="bg-[#191919] text-white font-space px-7 py-3 rounded-none font-semibold hover:bg-black transition-colors border border-[#191919] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
          >
            Book a demo
          </button>
          <a 
            href="#features" 
            className="border border-[#ededed] text-[#191919] font-space px-7 py-3 rounded-none font-semibold hover:bg-neutral-50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px] inline-block"
          >
            Explore capabilities
          </a>
        </motion.div>
        <motion.div 
          initial={reduce ? false : { opacity: 0, y: 30 }}
          animate={reduce ? false : { opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, delay: 0.4 }}
          className="mt-16 relative hero-mockup-container"
        >
          <img
            src="/dashboard-hero.png"
            alt="Procurely Dashboard"
            className="w-full max-w-[1100px] mx-auto border border-[#ededed] bg-white hero-mockup-3d"
          />
        </motion.div>
      </section>

      <SectionDivider />

      {/* Brands Bar */}
      <section className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-12 flex flex-col items-center justify-center overflow-hidden">
        <CornerPlus />
        <motion.p 
          initial={reduce ? false : { opacity: 0 }}
          whileInView={reduce ? undefined : { opacity: 1 }}
          viewport={{ once: true }}
          className="font-space text-xs uppercase tracking-widest text-[#737373] mb-8"
        >
          Built for procurement, finance, and operations teams
        </motion.p>
        <div className="relative w-full overflow-hidden flex">
          {/* Gradient overlay to fade logos out at the edges */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#fcfcfc] to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#fcfcfc] to-transparent z-10 pointer-events-none" />
          
          <motion.div 
            initial={reduce ? false : { opacity: 0 }}
            whileInView={reduce ? undefined : { opacity: 1 }}
            viewport={{ once: true }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="flex gap-20 items-center w-max animate-marquee hover:[animation-play-state:paused] cursor-pointer"
          >
            {/* Repeated arrays of logos for a seamless loop */}
            {[...logos, ...logos, ...logos].map((src, i) => (
              <img 
                key={i} 
                src={src} 
                alt="Client logo" 
                className="h-6 object-contain grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 shrink-0" 
              />
            ))}
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      {/* Problem Statement */}
      <section className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-24 px-6 md:px-12">
        <CornerPlus />
        <motion.div 
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={reduce ? { duration: 0 } : { duration: 0.6 }}
          className="max-w-3xl mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-sans font-light text-[#191919] tracking-[-0.03em] leading-tight mb-6">
            The problem with manual procurement cycles
          </h2>
          <p className="text-[#737373] text-lg leading-relaxed font-sans">
            Supplier research, approvals, POs, and invoices still move through disconnected tools, creating 2-3 week cycles for purchases that should take minutes.
          </p>
        </motion.div>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Card 1 */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="border border-[#ededed] bg-[#fcfcfc] p-8 flex flex-col justify-between relative min-h-[480px]"
          >
            <CornerPlus />
            <div className="mb-6">
              <h3 className="font-sans text-2xl font-light text-[#191919] tracking-tight mb-3">
                Procurement stuck in handoffs
              </h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed">
                Teams lose time comparing suppliers, chasing approvals, building purchase orders, and matching invoices by hand.
              </p>
            </div>
            <img 
              src="https://framerusercontent.com/images/kX9exbiMjOzIlAaMAdCEqqJ2zA.png" 
              alt="Handoffs mockup" 
              className="w-full border border-[#ededed] bg-white shadow-xs"
            />
          </motion.div>

          {/* Card 2 */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.15 }}
            className="border border-[#ededed] bg-[#fcfcfc] p-8 flex flex-col justify-between relative min-h-[480px]"
          >
            <CornerPlus />
            <div className="mb-6">
              <h3 className="font-sans text-2xl font-light text-[#191919] tracking-tight mb-3">
                One autonomous procurement agent
              </h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed">
                Procurely researches suppliers, negotiates pricing, routes approvals, creates POs, and checks invoices from a single request.
              </p>
            </div>
            <img 
              src="https://framerusercontent.com/images/anMMQzkHSmqfIRUTfD5PJN9VDg.png" 
              alt="Autonomous agent mockup" 
              className="w-full border border-[#ededed] bg-white shadow-xs"
            />
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      {/* Sticky Stacking Cards (Scroll Reveal) */}
      <section id="features" className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-24 px-6 md:px-12 flex flex-col gap-12">
        <CornerPlus />
        <motion.h2 
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reduce ? { duration: 0 } : { duration: 0.6 }}
          className="text-3xl md:text-5xl font-sans font-light text-[#191919] tracking-[-0.03em] leading-tight mb-16 text-center max-w-4xl mx-auto"
        >
          Run the entire purchase-to-pay loop from one request
        </motion.h2>

        <div className="flex flex-col gap-16 relative">
          {/* Card 1 - Sourcing */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="sticky top-28 z-10 w-full min-h-[474px] bg-[#f4f4f4] border border-[#ededed] p-8 md:p-12 flex flex-col md:flex-row gap-12 items-center relative"
          >
            <CornerPlus />
            <div className="md:w-1/2 w-full order-2 md:order-1">
              <img 
                src="https://framerusercontent.com/images/MX3HNqrEJ01i4kqgdVnDkeXOVI.png" 
                alt="Sourcing mockup" 
                className="w-full border border-[#ededed] shadow-xs bg-white"
              />
            </div>
            <div className="md:w-1/2 w-full order-1 md:order-2 flex flex-col gap-6">
              <h4 className="font-sans text-3xl font-light text-[#191919] leading-tight">
                Turn a request into qualified supplier options
              </h4>
              <p className="font-sans text-[#737373] text-base leading-relaxed">
                Procurely uses real-time web research, cross-session memory, and your approval policy to shortlist vendors with evidence your team can audit.
              </p>
              <button 
                onClick={() => navigate('/login')}
                className="font-space border border-[#ededed] bg-white px-5 py-2.5 hover:bg-neutral-50 hover:border-[#191919] hover:text-[#191919] transition-all duration-300 w-fit text-[#191919] font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
              >
                View sourcing flow
              </button>
            </div>
          </motion.div>

          {/* Card 2 - Negotiation */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="sticky top-28 z-20 w-full min-h-[474px] bg-[#f4f4f4] border border-[#ededed] p-8 md:p-12 flex flex-col md:flex-row gap-12 items-center relative"
          >
            <CornerPlus />
            <div className="md:w-1/2 w-full flex flex-col gap-6">
              <h4 className="font-sans text-3xl font-light text-[#191919] leading-tight">
                Negotiate price and terms before spend is approved
              </h4>
              <p className="font-sans text-[#737373] text-base leading-relaxed">
                Autonomous negotiation agents compare market signals, contact suppliers, and surface best-value options with HITL approval gates before any commitment.
              </p>
              <button 
                onClick={() => navigate('/login')}
                className="font-space border border-[#ededed] bg-white px-5 py-2.5 hover:bg-neutral-50 hover:border-[#191919] hover:text-[#191919] transition-all duration-300 w-fit text-[#191919] font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
              >
                See negotiation tools
              </button>
            </div>
            <div className="md:w-1/2 w-full">
              <img 
                src="https://framerusercontent.com/images/LVggzU8ChBFPgvtXEilJdK23PY.png" 
                alt="Negotiation mockup" 
                className="w-full border border-[#ededed] shadow-xs bg-white"
              />
            </div>
          </motion.div>

          {/* Card 3 - POs & Match */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="relative z-30 w-full min-h-[474px] bg-[#f4f4f4] border border-[#ededed] p-8 md:p-12 flex flex-col md:flex-row gap-12 items-center"
          >
            <CornerPlus />
            <div className="md:w-1/2 w-full order-2 md:order-1">
              <img 
                src="https://framerusercontent.com/images/wiPH8LAYQR3ffg2hsJKuBoFS9wY.png" 
                alt="PO mapping mockup" 
                className="w-full border border-[#ededed] shadow-xs bg-white"
              />
            </div>
            <div className="md:w-1/2 w-full order-1 md:order-2 flex flex-col gap-6">
              <h4 className="font-sans text-3xl font-light text-[#191919] leading-tight">
                Create POs, match invoices, and keep the audit trail
              </h4>
              <p className="font-sans text-[#737373] text-base leading-relaxed">
                Procurely generates purchase orders, reads invoices with OCR, performs 3-way matching, and keeps Firebase RBAC-backed audit trails for finance review.
              </p>
              <button 
                onClick={() => navigate('/login')}
                className="font-space border border-[#ededed] bg-white px-5 py-2.5 hover:bg-neutral-50 hover:border-[#191919] hover:text-[#191919] transition-all duration-300 w-fit text-[#191919] font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
              >
                Review controls
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      {/* Capabilities Grid */}
      <section className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-24 px-6 md:px-12">
        <CornerPlus />
        <motion.div 
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reduce ? { duration: 0 } : { duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-sans font-light text-[#191919] tracking-[-0.03em] mb-6">
            Autonomous procurement operations
          </h2>
          <p className="text-lg text-[#737373] leading-relaxed font-sans">
            Twenty-six agent tools coordinate sourcing, negotiation, PO creation, approval routing, and invoice processing.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {capabilities.map((cap, i) => (
            <motion.div 
              key={cap.step} 
              initial={reduce ? false : { opacity: 0, y: 30 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, delay: i * 0.05 }}
              className="border border-[#ededed] bg-[#fcfcfc] p-8 flex flex-col justify-between min-h-[240px] hover:border-neutral-900 transition-all duration-300 relative group"
            >
              <CornerPlus />
              <div>
                <span className="font-space text-xs text-neutral-400 font-semibold uppercase block mb-6 group-hover:text-neutral-900 transition-colors">
                  Capability {cap.step}
                </span>
                <h3 className="font-sans text-2xl font-light text-[#191919] mb-3">
                  {cap.title}
                </h3>
                <p className="font-sans text-[#737373] text-sm leading-relaxed">
                  {cap.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* How it Works */}
      <section id="how-it-works" className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-24 px-6 md:px-12 bg-dot-pattern">
        <CornerPlus />
        <motion.div 
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reduce ? { duration: 0 } : { duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-sans font-light text-[#191919] tracking-[-0.03em] mb-6">
            How Procurely turns a request into completed procurement
          </h2>
          <p className="text-lg text-[#737373] leading-relaxed font-sans">
            Ask for what you need once. Procurely coordinates the research, controls, documents, and finance checks.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="border border-[#ededed] bg-[#fcfcfc] p-6 relative flex flex-col justify-between min-h-[480px] hover:border-neutral-900 transition-all duration-300"
          >
            <CornerPlus />
            <div className="mb-6">
              <span className="font-space text-xs font-semibold text-neutral-400 block mb-2 uppercase">Step 1</span>
              <h3 className="font-sans text-xl font-light text-[#191919] mb-3">Describe the purchase</h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed">
                A teammate asks for a vendor, renewal, or purchase in natural language through text or voice input.
              </p>
            </div>
            <img 
              src="https://framerusercontent.com/images/SMhyQZ0ZUQl7exxlOZUZtihso.png" 
              alt="Step 1 mockup" 
              className="w-full border border-[#ededed] bg-white shadow-xs"
            />
          </motion.div>

          {/* Step 2 */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.1 }}
            className="border border-[#ededed] bg-[#fcfcfc] p-6 relative flex flex-col justify-between min-h-[480px] hover:border-neutral-900 transition-all duration-300"
          >
            <CornerPlus />
            <div className="mb-6">
              <span className="font-space text-xs font-semibold text-neutral-400 block mb-2 uppercase">Step 2</span>
              <h3 className="font-sans text-xl font-light text-[#191919] mb-3">Agents orchestrate the workflow</h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed">
                Qwen Cloud models, RAG memory, and 26 tools research suppliers, negotiate, and prepare approvals.
              </p>
            </div>
            <img 
              src="https://framerusercontent.com/images/D1sdpjEClZUX7BPy9gZnYNVh2SU.png" 
              alt="Step 2 mockup" 
              className="w-full border border-[#ededed] bg-white shadow-xs"
            />
          </motion.div>

          {/* Step 3 */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.2 }}
            className="border border-[#ededed] bg-[#fcfcfc] p-6 relative flex flex-col justify-between min-h-[480px] hover:border-neutral-900 transition-all duration-300"
          >
            <CornerPlus />
            <div className="mb-6">
              <span className="font-space text-xs font-semibold text-neutral-400 block mb-2 uppercase">Step 3</span>
              <h3 className="font-sans text-xl font-light text-[#191919] mb-3">Finance gets clean execution</h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed">
                POs, invoices, 3-way matching, audit trails, and approvals stay connected end to end.
              </p>
            </div>
            <img 
              src="https://framerusercontent.com/images/cV3Qv3v8NRCeTWzbPZaisvTxQ.png" 
              alt="Step 3 mockup" 
              className="w-full border border-[#ededed] bg-white shadow-xs"
            />
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      {/* Integrations Stack */}
      <section className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-24 px-6 md:px-12">
        <CornerPlus />
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-5xl font-sans font-light text-[#191919] tracking-[-0.03em] mb-6">
            Works with your procurement and finance stack
          </h2>
          <p className="text-lg text-[#737373] leading-relaxed font-sans">
            Procurely brings supplier research, policy memory, approval gates, and invoice controls into one autonomous P2P layer.
          </p>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.95 }}
          whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={reduce ? { duration: 0 } : { duration: 0.7 }}
        >
          <IntegrationsGraph />
        </motion.div>
      </section>

      <SectionDivider />

      {/* Pricing */}
      <section id="pricing" className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-24 px-6 md:px-12">
        <CornerPlus />
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-sans font-light text-[#191919] tracking-[-0.03em] mb-6">
            Pricing for procurement teams that move spend
          </h2>
          <p className="text-lg text-[#737373] leading-relaxed font-sans">
            Plans for mid-market teams managing recurring supplier work, finance controls, and high-volume purchase requests.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Card 1: Pilot */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            className="border border-[#ededed] bg-white p-8 relative flex flex-col justify-between min-h-[480px]"
          >
            <CornerPlus />
            <div>
              <span className="font-space text-xs font-semibold text-neutral-400 block mb-6 uppercase">Tier 01</span>
              <h3 className="font-sans text-2xl font-light text-[#191919] mb-2">Pilot</h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed mb-6">Explore basic autonomous workflows and supplier sourcing capabilities.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-sans text-4xl text-[#191919] font-light">Custom</span>
                <span className="text-xs text-[#737373] font-space">/ month</span>
              </div>
              <ul className="space-y-3 font-sans text-sm text-[#737373] border-t border-[#ededed] pt-6">
                <li className="flex items-center gap-2">✓ Procurement workflow mapping</li>
                <li className="flex items-center gap-2">✓ Supplier sourcing agent</li>
                <li className="flex items-center gap-2">✓ Approval policy setup</li>
                <li className="flex items-center gap-2">✓ Invoice OCR trial</li>
                <li className="flex items-center gap-2">✓ Audit trail review</li>
              </ul>
            </div>
            <button 
              onClick={() => navigate('/login')}
              className="w-full bg-[#191919] text-white font-space py-3 rounded-none font-semibold hover:bg-black transition-colors mt-8 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
            >
              Book a pilot
            </button>
          </motion.div>

          {/* Card 2: Team */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.15 }}
            className="border border-neutral-900 bg-neutral-900 text-white p-8 relative flex flex-col justify-between min-h-[480px] shadow-lg"
          >
            <CornerPlus />
            <div>
              <div className="flex justify-between items-center mb-6">
                <span className="font-space text-xs text-neutral-400 font-semibold uppercase">Tier 02</span>
                <span className="bg-white text-neutral-900 font-space text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">Popular</span>
              </div>
              <h3 className="font-sans text-2xl font-light text-white mb-2">Team</h3>
              <p className="font-sans text-neutral-400 text-sm leading-relaxed mb-6">For growing teams ready to automate end-to-end procurement cycles.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-sans text-4xl text-white font-light">Custom</span>
                <span className="text-xs text-neutral-400 font-space">/ month</span>
              </div>
              <ul className="space-y-3 font-sans text-sm text-neutral-300 border-t border-neutral-800 pt-6">
                <li className="flex items-center gap-2">✓ Up to 50 procurement users</li>
                <li className="flex items-center gap-2">✓ 26 autonomous agent tools</li>
                <li className="flex items-center gap-2">✓ AI negotiation workflows</li>
                <li className="flex items-center gap-2">✓ PO creation and routing</li>
                <li className="flex items-center gap-2">✓ 3-way invoice matching</li>
                <li className="flex items-center gap-2">✓ RAG memory pipeline</li>
                <li className="flex items-center gap-2">✓ HITL approval gates</li>
              </ul>
            </div>
            <button 
              onClick={() => navigate('/login')}
              className="w-full bg-white text-neutral-900 font-space py-3 rounded-none font-semibold hover:bg-neutral-100 transition-colors mt-8 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 active:scale-[0.98] active:translate-y-[1px]"
            >
              Talk to sales
            </button>
          </motion.div>

          {/* Card 3: Enterprise */}
          <motion.div 
            initial={reduce ? false : { opacity: 0, y: 40 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.3 }}
            className="border border-[#ededed] bg-white p-8 relative flex flex-col justify-between min-h-[480px]"
          >
            <CornerPlus />
            <div>
              <span className="font-space text-xs font-semibold text-neutral-400 block mb-6 uppercase">Tier 03</span>
              <h3 className="font-sans text-2xl font-light text-[#191919] mb-2">Enterprise</h3>
              <p className="font-sans text-[#737373] text-sm leading-relaxed mb-6">Complete customization, integrations, and dedicated assistance.</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-sans text-4xl text-[#191919] font-light">Custom</span>
                <span className="text-xs text-[#737373] font-space">/ month</span>
              </div>
              <ul className="space-y-3 font-sans text-sm text-[#737373] border-t border-[#ededed] pt-6">
                <li className="flex items-center gap-2">✓ Custom RBAC & audit trails</li>
                <li className="flex items-center gap-2">✓ Advanced workflow engine</li>
                <li className="flex items-center gap-2">✓ Finance system integrations</li>
                <li className="flex items-center gap-2">✓ Multi-agent orchestration</li>
                <li className="flex items-center gap-2">✓ Dedicated implementation</li>
                <li className="flex items-center gap-2">✓ Security review support</li>
                <li className="flex items-center gap-2">✓ Executive reporting</li>
              </ul>
            </div>
            <button 
              onClick={() => navigate('/login')}
              className="w-full bg-[#191919] text-white font-space py-3 rounded-none font-semibold hover:bg-black transition-colors mt-8 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
            >
              Contact sales
            </button>
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      {/* Bottom CTA */}
      <section className="relative max-w-[1224px] mx-auto border-x border-[#ededed] py-32 px-6 md:px-12 text-center bg-[#fcfcfc]">
        <CornerPlus />
        <motion.h2 
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reduce ? { duration: 0 } : { duration: 0.6 }}
          className="text-4xl md:text-6xl font-sans font-light text-[#191919] tracking-[-0.03em] mb-6 max-w-4xl mx-auto"
        >
          Let procurement run itself
        </motion.h2>
        <motion.p 
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.1 }}
          className="text-lg text-[#737373] max-w-xl mx-auto mb-10 leading-relaxed font-sans"
        >
          Let Procurely turn procurement requests into approved spend, matched invoices, and clean audit trails.
        </motion.p>
        <motion.button
          onClick={() => navigate('/login')}
          initial={reduce ? false : { opacity: 0, scale: 0.95 }}
          whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.2 }}
          className="bg-[#191919] text-white font-space px-8 py-4 rounded-none font-semibold text-lg hover:bg-black transition-colors border border-[#191919] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 active:scale-[0.98] active:translate-y-[1px]"
        >
          Book a demo ↗
        </motion.button>
      </section>

      <SectionDivider />

      {/* Footer */}
      <footer className="relative max-w-[1224px] mx-auto border-x border-b border-[#ededed] py-12 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-6 bg-[#fcfcfc]">
        <CornerPlus />
        <div className="flex items-center gap-2">
          <img src="/procurely-icon.svg" alt="Procurely" className="h-5 w-5" />
          <span className="text-xs text-[#737373] font-space font-medium">Copyright 2026 Procurely AI Inc. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-8 text-xs font-space">
          <a href="#features" className="hover:text-[#191919] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 rounded-xs">Features</a>
          <a href="#how-it-works" className="hover:text-[#191919] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 rounded-xs">How it works</a>
          <a href="#pricing" className="hover:text-[#191919] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 rounded-xs">Pricing</a>
          <a href="mailto:info@procurely.ai" className="hover:text-[#191919] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-950 rounded-xs">Contact</a>
        </div>
      </footer>
    </div>
  );
}
