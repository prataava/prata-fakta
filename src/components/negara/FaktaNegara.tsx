import {
  angkaDariNilai,
  formatAngka,
  kelompokkanFakta,
  LABEL_KELOMPOK_FAKTA,
  type KelompokFakta,
  type PfFaktaNegara,
} from "@/lib/negara";

// Fakta kunci negara, dikelompokkan (pendidikan / energi /
// geografi / hubungan internasional / lainnya). SETIAP angka
// tampil bersama sumber + periodenya. Fakta tanpa sumber TIDAK
// menampilkan nilainya sebagai angka — hanya kuncinya, dengan
// catatan jujur bahwa sumber belum dicatat.
function labelKunci(kunci: string): string {
  return kunci
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function NilaiFakta({ fakta }: { fakta: PfFaktaNegara }) {
  const angka = angkaDariNilai(fakta.nilai);
  return (
    <p>
      <strong>
        {angka !== null ? formatAngka(angka) : fakta.nilai}
        {fakta.satuan ? ` ${fakta.satuan}` : ""}
      </strong>
      {fakta.sumber ? (
        <>
          {" — Sumber: "}
          {fakta.sumber}
          {fakta.periode ? ` (${fakta.periode})` : ""}
        </>
      ) : (
        " — Sumber: belum dicatat"
      )}
    </p>
  );
}

export default function FaktaNegara({
  bernilai,
  tanpaSumber,
}: {
  bernilai: PfFaktaNegara[];
  tanpaSumber: PfFaktaNegara[];
}) {
  if (bernilai.length === 0 && tanpaSumber.length === 0) return null;
  const kelompok = kelompokkanFakta(bernilai);
  const urutan: KelompokFakta[] = [
    "pendidikan",
    "energi",
    "geografi",
    "hubungan_internasional",
    "lainnya",
  ];
  return (
    <>
      {urutan.map((k) =>
        kelompok[k].length === 0 ? null : (
          <section
            className="seksi"
            aria-labelledby={`seksi-fakta-${k}`}
            key={k}
          >
            <div className="seksi-kepala">
              <h2 id={`seksi-fakta-${k}`}>{LABEL_KELOMPOK_FAKTA[k]}</h2>
            </div>
            <ul>
              {kelompok[k].map((f) => (
                <li key={f.id}>
                  <strong>{labelKunci(f.kunci)}:</strong>{" "}
                  <NilaiFakta fakta={f} />
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
      {tanpaSumber.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-fakta-tanpa-sumber">
          <div className="seksi-kepala">
            <h2 id="seksi-fakta-tanpa-sumber">Fakta tanpa sumber tercatat</h2>
            <p>
              Fakta di bawah ini tercatat tanpa sumber, jadi nilainya
              tidak ditampilkan sebagai angka sampai editor mencatat
              sumbernya.
            </p>
          </div>
          <ul>
            {tanpaSumber.map((f) => (
              <li key={f.id}>
                {labelKunci(f.kunci)} — nilai tidak ditampilkan (sumber
                belum dicatat).
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
