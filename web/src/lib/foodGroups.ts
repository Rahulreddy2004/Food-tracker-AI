import {
  Apple,
  Beef,
  CakeSlice,
  Coffee,
  Croissant,
  EggFried,
  Fish,
  Hamburger,
  type LucideIcon,
  Package,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Utensils,
  Wheat,
} from "lucide-react";

interface GroupStyle {
  icon: LucideIcon;
  /** Tint drawn from the brand palette; icons sit in a soft circle of this colour. */
  tint: "primary" | "secondary" | "accent" | "protein" | "fat";
}

const GROUPS: Record<string, GroupStyle> = {
  Dessert: { icon: CakeSlice, tint: "fat" },
  Meat: { icon: Beef, tint: "primary" },
  Seafood: { icon: Fish, tint: "protein" },
  Salad: { icon: Salad, tint: "secondary" },
  Vegetarian: { icon: Salad, tint: "secondary" },
  Soup: { icon: Soup, tint: "accent" },
  Curry: { icon: Soup, tint: "primary" },
  Breakfast: { icon: EggFried, tint: "accent" },
  Sandwich: { icon: Sandwich, tint: "accent" },
  Burger: { icon: Hamburger, tint: "primary" },
  Pizza: { icon: Pizza, tint: "primary" },
  Pasta: { icon: Wheat, tint: "accent" },
  "Rice Dish": { icon: Wheat, tint: "accent" },
  "Noodle Dish": { icon: Soup, tint: "accent" },
  "Side Dish": { icon: Croissant, tint: "accent" },
  Appetizer: { icon: Utensils, tint: "secondary" },
  "Tex-Mex": { icon: Utensils, tint: "primary" },
  "My pantry": { icon: Package, tint: "secondary" },
  Drinks: { icon: Coffee, tint: "accent" },
  Drink: { icon: Coffee, tint: "accent" },
  Bread: { icon: Croissant, tint: "accent" },
  Fruit: { icon: Apple, tint: "secondary" },
};

export function groupStyle(group: string | null | undefined): GroupStyle {
  return (group && GROUPS[group]) || { icon: Utensils, tint: "secondary" };
}
