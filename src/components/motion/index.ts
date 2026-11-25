// PRATA FAKTA — komponen gerak reusable (Fase 3 redesign).
// Satu pintu masuk: impor dari "@/components/motion".
// Detail pakai: docs/design-system/MOTION_COMPONENTS.md

export { MotionProvider } from "./MotionProvider";
export {
  DURASI_CEPAT,
  DURASI_DASAR,
  DURASI_HALAMAN,
  DURASI_PENEKANAN,
  MOTION_EASE,
  SPRING_AURORA,
  STAGGER_KARTU,
} from "./token";
export { Reveal, Stagger, StaggerItem } from "./Reveal";
export { MotionCard } from "./MotionCard";
export { AreaPulse } from "./AreaPulse";
export { Skeleton } from "./Skeleton";
export { TombolGerak } from "./TombolGerak";
export { Drawer, Modal } from "./Modal";
export { Dropdown, DropdownItem } from "./Dropdown";
export { ToastProvider, useToast } from "./Toast";
