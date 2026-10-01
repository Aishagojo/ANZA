/**
 * Screen 2 — Creator Profile / My Content.
 *
 * Purpose:
 *   This is the creator-centric dashboard. A creator sees their uploaded videos,
 *   their content status, and the action to create an offer against a selected
 *   media item.
 *
 * Functionality:
 *   - Displays the creator identity and Nostr public key.
 *   - Lists the content library as a video grid.
 *   - Each card offers a primary action: Create Offer.
 *   - The content can be linked to the existing offer form and backend video data.
 *
 * Backend note:
 *   - The actual uploaded video metadata, Cloudinary URLs, and creator identity
 *     should come from the backend/Cloudinary integration.
 */
import Link from "next/link";
import { ArrowUpRight, CheckCircle, Ellipsis, UserCircle2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";

const creatorVideos = [
  {
    id: "mountain",
    title: "mountain-view.mp4",
    date: "Uploaded 22 Sept 2026",
    status: "Available",
    statusColor: "bg-emerald-100 text-emerald-700",
    image:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
    href: "/create",
  },
  {
    id: "city",
    title: "city-sunset.mp4",
    date: "Uploaded 20 Sept 2026",
    status: "No Offer",
    statusColor: "bg-slate-100 text-slate-600",
    image:
      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80",
    href: "/create",
  },
  {
    id: "nature",
    title: "nature-closeup.mp4",
    date: "Uploaded 18 Sept 2026",
    status: "Available",
    statusColor: "bg-emerald-100 text-emerald-700",
    image:
      "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1200&q=80",
    href: "/create",
  },
  {
    id: "food",
    title: "food-ad.mp4",
    date: "Uploaded 15 Sept 2026",
    status: "Available",
    statusColor: "bg-emerald-100 text-emerald-700",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80",
    href: "/create",
  },
  {
    id: "ocean",
    title: "ocean-dream.mp4",
    date: "Uploaded 12 Sept 2026",
    status: "No Offer",
    statusColor: "bg-slate-100 text-slate-600",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    href: "/create",
  },
  {
    id: "lifestyle",
    title: "lifestyle.mp4",
    date: "Uploaded 10 Sept 2026",
    status: "Available",
    statusColor: "bg-emerald-100 text-emerald-700",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    href: "/create",
  },
];

export default function CreatorProfilePage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-800">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
                <UserCircle2 size={26} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">@creator</p>
                <p className="text-xs text-slate-500">npub1...7h3k</p>
              </div>
            </div>

            <nav className="mt-5 space-y-3">
              <button className="flex w-full items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-left font-semibold text-blue-700">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-700">
                  <ArrowUpRight size={16} />
                </span>
                Browse Offers
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-600 transition hover:bg-slate-200/60">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600">
                  <ArrowUpRight size={16} />
                </span>
                My Purchases
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-slate-600 transition hover:bg-slate-200/60">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-600">
                  <ArrowUpRight size={16} />
                </span>
                Profile
              </button>
            </nav>

            <div className="mt-10 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              <div className="flex items-center gap-2 font-semibold">
                <span className="text-lg text-emerald-500">⚡</span>
                Powered by
              </div>
              <p className="mt-1 text-slate-500">Nostr + Lightning</p>
            </div>
          </aside>

          <section className="p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Videos</h1>
                <p className="mt-1 text-slate-500">Manage your uploaded content and create licensing offers.</p>
              </div>

              <Link
                href="/create"
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                + Upload Video
              </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {creatorVideos.map((video) => (
                <article key={video.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                  <div className="relative">
                    <img src={video.image} alt={video.title} className="h-44 w-full object-cover" />
                    <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white">
                      00:45
                    </span>
                  </div>

                  <div className="space-y-4 p-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-800">{video.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{video.date}</p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${video.statusColor}`}>
                        {video.status === "Available" ? <CheckCircle size={12} className="mr-1 inline" /> : null}
                        {video.status}
                      </span>

                      <button type="button" aria-label="More options" className="rounded-full p-2 hover:bg-slate-200/80">
                        <Ellipsis size={16} className="text-slate-600" />
                      </button>
                    </div>

                    <Link
                      href={video.href}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      Create Offer
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
      </main>
    </>
  );
}
