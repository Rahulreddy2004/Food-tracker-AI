import { useEffect } from "react";

/** Sets the browser tab title for a page ("Diary · Food Tracker"). */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title
      ? `${title} · Food Tracker`
      : "Food Tracker — snap your plate, know your food";
  }, [title]);
}
