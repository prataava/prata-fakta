// Bilah pencarian: form GET biasa ke /cari — berfungsi tanpa JavaScript.
export default function SearchBar({ nilaiAwal = "" }: { nilaiAwal?: string }) {
  return (
    <form className="cari" action="/cari" method="get" role="search">
      <label htmlFor="cari-q" className="sr-only" style={{ position: "absolute", left: -9999 }}>
        Cari berita, topik, atau sumber
      </label>
      <input
        id="cari-q"
        type="search"
        name="q"
        defaultValue={nilaiAwal}
        placeholder="Cari berita, topik, atau sumber…"
        autoComplete="off"
      />
      <button className="tombol tombol-primer" type="submit">
        Cari
      </button>
    </form>
  );
}
