import { SearchForm } from "@/components/SearchForm";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">
        Sua próxima estadia, reservada direto com quem cuida dela.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-ink-muted">
        Unidades da Titan Empreendimentos, com cotação transparente e sem taxa de intermediação de
        canal.
      </p>
      <div className="mt-10">
        <SearchForm />
      </div>
    </div>
  );
}
