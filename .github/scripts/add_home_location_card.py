from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Expected block not found: {label}')
    return text.replace(old, new, 1)

# 1) Expose business location through the existing home loader.
fn_path = Path('src/lib/clinic.functions.ts')
text = fn_path.read_text()
text = replace_once(
    text,
    '''export const getHomeOverview = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [catalog, professionals] = await Promise.all([
    fetchCatalog(),
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  if (professionals.error) throw professionals.error;

  return {
    ...catalog,
    activeProfessionals: professionals.count ?? 0,
  };
});''',
    '''export const getHomeOverview = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const db = supabase as any;
  const [catalog, professionals, settings] = await Promise.all([
    fetchCatalog(),
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("business_settings").select("address, maps_url").eq("id", 1).maybeSingle(),
  ]);

  if (professionals.error) throw professionals.error;
  if (settings.error) throw settings.error;

  return {
    ...catalog,
    activeProfessionals: professionals.count ?? 0,
    businessAddress: settings.data?.address?.trim() || null,
    mapsUrl: settings.data?.maps_url?.trim() || null,
  };
});''',
    'home overview settings',
)
fn_path.write_text(text)

# 2) Add a compact location card below the ticker on the public homepage.
index_path = Path('src/routes/index.tsx')
text = index_path.read_text()
text = replace_once(
    text,
    'import { ArrowRight, CalendarCheck2, UsersRound } from "lucide-react";',
    'import { ArrowRight, CalendarCheck2, MapPin, Navigation, UsersRound } from "lucide-react";',
    'lucide imports',
)
text = replace_once(
    text,
    '''function Home() {
  const catalog = Route.useLoaderData();

  return (''',
    '''function Home() {
  const catalog = Route.useLoaderData();
  const locationUrl = catalog.mapsUrl || (catalog.businessAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(catalog.businessAddress)}`
    : null);

  return (''',
    'home location url',
)
text = replace_once(
    text,
    '''            <div className="mx-auto mt-8 max-w-[650px] overflow-hidden rounded-full border border-primary/10 bg-card/55 py-2.5 shadow-[0_18px_36px_-32px_rgba(15,77,62,0.65)] backdrop-blur sm:mx-0 sm:mt-11">
              <div className="jr-home-marquee-track flex items-center">
                {[...tickerItems, ...tickerItems].map((item, index) => (
                  <div key={`${item}-${index}`} className="flex shrink-0 items-center">
                    <span className="whitespace-nowrap px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-primary/65 sm:px-5 sm:text-[11px]">
                      {item}
                    </span>
                    <span className="size-1 rounded-full bg-accent/65" />
                  </div>
                ))}
              </div>
            </div>''',
    '''            <div className="mx-auto mt-8 max-w-[650px] overflow-hidden rounded-full border border-primary/10 bg-card/55 py-2.5 shadow-[0_18px_36px_-32px_rgba(15,77,62,0.65)] backdrop-blur sm:mx-0 sm:mt-11">
              <div className="jr-home-marquee-track flex items-center">
                {[...tickerItems, ...tickerItems].map((item, index) => (
                  <div key={`${item}-${index}`} className="flex shrink-0 items-center">
                    <span className="whitespace-nowrap px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-primary/65 sm:px-5 sm:text-[11px]">
                      {item}
                    </span>
                    <span className="size-1 rounded-full bg-accent/65" />
                  </div>
                ))}
              </div>
            </div>

            {catalog.businessAddress ? (
              <div className="mx-auto mt-4 flex max-w-[650px] flex-col gap-3 rounded-2xl border border-primary/10 bg-card/70 p-3.5 text-left shadow-[0_18px_36px_-32px_rgba(15,77,62,0.5)] backdrop-blur sm:mx-0 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary">
                    <MapPin className="size-4.5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-primary/60 sm:text-[10px]">Onde estamos</p>
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-5 text-foreground sm:text-sm">{catalog.businessAddress}</p>
                  </div>
                </div>
                {locationUrl ? (
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-primary/15 bg-background px-4 text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <Navigation className="size-3.5" />
                    Ver rota
                  </a>
                ) : null}
              </div>
            ) : null}''',
    'ticker location card',
)
index_path.write_text(text)
print('home location card patch applied')
