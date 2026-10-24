import type { LucideIcon } from 'lucide-react';

export type ToolId =
  | 'compress'
  | 'convert'
  | 'batch'
  | 'id-photo'
  | 'merge-pdf'
  | 'pages'
  | 'sign'
  | 'print-layout';

export type ToolCategory = 'image' | 'pdf';

export interface ToolMeta {
  id: ToolId;
  category: ToolCategory;
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  tint: string;
}

export interface Preferences {
  recentTools: ToolId[];
}

export interface ImageExportOptions {
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
  width?: number;
  height?: number;
  preserveAspect?: boolean;
  backgroundColor?: string;
}

export interface CompressionOptions extends ImageExportOptions {
  targetBytes: number;
  minQuality?: number;
}

export interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
  reachedTarget: boolean;
  quality: number;
}

export interface CropTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface PhotoSize {
  widthInches: number;
  heightInches: number;
}

export interface PrintLayoutOptions {
  pagesPerSheet: 1 | 2 | 4 | 6;
  orientation: 'portrait' | 'landscape';
  marginMm: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

