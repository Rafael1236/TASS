const franquiciaLogoUrl = `${import.meta.env.BASE_URL}franquicia-logo.png`;

export function DashboardFooter() {
  return (
    <footer className="bg-white">
      <div className="mx-auto w-full max-w-[1400px] px-6 h-20 flex items-center justify-center gap-4">
        <span className="text-sm font-medium tracking-wide text-[#555]">
          Franquicia operada por
        </span>
        <div className="h-5 w-px bg-[#CCC]" />
        <img
          src={franquiciaLogoUrl}
          alt="López &amp; Pinaud"
          className="h-8 w-auto opacity-85 hover:opacity-100 transition-opacity"
        />
      </div>
    </footer>
  );
}
