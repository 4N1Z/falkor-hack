import { cn } from "@/lib/utils";

const colors = [
  { name: "background", value: "bg-background" },
  { name: "foreground", value: "bg-foreground" },
  { name: "card", value: "bg-card" },
  { name: "card-foreground", value: "bg-card-foreground" },
  { name: "primary", value: "bg-primary" },
  { name: "primary-foreground", value: "bg-primary-foreground" },
  { name: "secondary", value: "bg-secondary" },
  { name: "secondary-foreground", value: "bg-secondary-foreground" },
  { name: "muted", value: "bg-muted" },
  { name: "muted-foreground", value: "bg-muted-foreground" },
  { name: "accent", value: "bg-accent" },
  { name: "accent-foreground", value: "bg-accent-foreground" },
  { name: "destructive", value: "bg-destructive" },
  { name: "destructive-foreground", value: "bg-destructive-foreground" },
  { name: "border", value: "bg-border" },
  { name: "input", value: "bg-input" },
  { name: "ring", value: "bg-ring" },
  { name: "chart-1", value: "bg-chart-1" },
  { name: "chart-2", value: "bg-chart-2" },
  { name: "chart-3", value: "bg-chart-3" },
  { name: "chart-4", value: "bg-chart-4" },
  { name: "chart-5", value: "bg-chart-5" },
];

export function ColorPalette() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Color Palette</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {colors.map((color) => (
          <div
            key={color.name}
            className="border rounded-lg overflow-hidden shadow-sm"
          >
            <div
              className={cn(
                "h-24 w-full",
                color.value
              )}
            />
            <div className="p-3">
              <p className="font-medium">{color.name}</p>
              <p className="text-sm text-muted-foreground">
                var(--{color.name})
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 