import {
  ArrowLeftRight,
  FileStack,
  Files,
  ImageDown,
  Images,
  LayoutGrid,
  PenLine,
  UserRound,
} from 'lucide-react';
import type { ToolId, ToolMeta } from '../types';

export const toolCatalog: ToolMeta[] = [
  {
    id: 'compress', category: 'image', title: 'บีบอัดรูปภาพ',
    description: 'ลดขนาดไฟล์ให้พอดี โดยคุมคุณภาพได้เอง',
    keywords: ['compress', 'jpg', 'jpeg', 'png', 'webp', 'size', 'ขนาดไฟล์'],
    icon: ImageDown, tint: 'mint',
  },
  {
    id: 'convert', category: 'image', title: 'แปลงไฟล์รูปภาพ',
    description: 'เปลี่ยน JPG, PNG, WebP และ HEIC ได้ในเครื่อง',
    keywords: ['convert', 'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp'],
    icon: ArrowLeftRight, tint: 'lilac',
  },
  {
    id: 'batch', category: 'image', title: 'จัดการภาพหลายไฟล์',
    description: 'ย่อและแปลงภาพหลายรูปพร้อมกัน แล้วดาวน์โหลดเป็น ZIP',
    keywords: ['batch', 'multiple', 'zip', 'resize', 'หลายรูป'],
    icon: Images, tint: 'peach',
  },
  {
    id: 'id-photo', category: 'image', title: 'ทำรูปติดบัตร',
    description: 'ครอปภาพ เลือกขนาด และกำหนด DPI ก่อนส่งออก',
    keywords: ['photo', 'passport', 'crop', 'dpi', 'รูปถ่าย', 'ติดบัตร'],
    icon: UserRound, tint: 'sky',
  },
  {
    id: 'merge-pdf', category: 'pdf', title: 'รวมไฟล์ PDF',
    description: 'รวมหลายไฟล์และจัดลำดับก่อนดาวน์โหลด',
    keywords: ['merge', 'combine', 'join', 'pdf', 'รวม'],
    icon: FileStack, tint: 'sky',
  },
  {
    id: 'pages', category: 'pdf', title: 'จัดการหน้า PDF',
    description: 'เลือก ลบ และเรียงหน้าจาก Thumbnail จริง',
    keywords: ['pages', 'extract', 'remove', 'split', 'pdf', 'หน้า'],
    icon: Files, tint: 'peach',
  },
  {
    id: 'sign', category: 'pdf', title: 'เซ็นเอกสาร PDF',
    description: 'วาดลายเซ็นแล้ววางบนหน้าเอกสาร',
    keywords: ['signature', 'sign', 'pdf', 'เซ็น', 'ลายเซ็น'],
    icon: PenLine, tint: 'lilac',
  },
  {
    id: 'print-layout', category: 'pdf', title: 'จัดหน้าพิมพ์',
    description: 'วาง 1, 2, 4 หรือ 6 หน้าลงบนกระดาษ A4',
    keywords: ['print', 'n-up', 'a4', 'layout', 'pdf', 'พิมพ์'],
    icon: LayoutGrid, tint: 'mint',
  },
];

export const toolById = new Map<ToolId, ToolMeta>(toolCatalog.map((tool) => [tool.id, tool]));
