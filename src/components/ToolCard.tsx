import { ArrowUpRight, Clock3 } from 'lucide-react';
import type { ToolMeta } from '../types';

interface ToolCardProps {
  tool: ToolMeta;
  recent?: boolean;
  onSelect: () => void;
}

export function ToolCard({ tool, recent = false, onSelect }: ToolCardProps) {
  const Icon = tool.icon;
  return (
    <button className={`tool-card tool-card--${tool.tint}`} type="button" onClick={onSelect} aria-label={`${tool.title} — ${tool.description}`}>
      <span className="tool-card-icon"><Icon size={22} strokeWidth={1.9} /></span>
      {recent ? <span className="recent-mark"><Clock3 size={12} /> ล่าสุด</span> : null}
      <span className="tool-card-copy">
        <strong>{tool.title}</strong>
        <small>{tool.description}</small>
      </span>
      <span className="tool-card-arrow"><ArrowUpRight size={17} /></span>
    </button>
  );
}
