import React from "react";
import {
  Briefcase,
  Car,
  Coffee,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Receipt,
  ShoppingBag,
  Smartphone,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  "shopping-bag": ShoppingBag,
  receipt: Receipt,
  "heart-pulse": HeartPulse,
  film: Film,
  "graduation-cap": GraduationCap,
  tag: Tag,
  coffee: Coffee,
  home: Home,
  smartphone: Smartphone,
  gift: Gift,
  zap: Zap,
  briefcase: Briefcase,
};

export const CATEGORY_ICON_OPTIONS = Object.keys(CATEGORY_ICON_MAP);

export const CATEGORY_COLOR_OPTIONS = [
  "#F97316",
  "#3B82F6",
  "#EC4899",
  "#EAB308",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#10B981",
  "#14B8A6",
  "#64748B",
];

export function CategoryIcon({
  icon,
  color = "#64748B",
  size = "md",
}: {
  icon?: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = CATEGORY_ICON_MAP[icon || "tag"] || Tag;
  const dims =
    size === "sm"
      ? "h-8 w-8 rounded-xl"
      : size === "lg"
        ? "h-11 w-11 rounded-2xl"
        : "h-9 w-9 rounded-xl";
  const iconDims =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${dims}`}
      style={{
        backgroundColor: `${color}1F`,
        color,
      }}
    >
      <Icon className={iconDims} />
    </div>
  );
}
