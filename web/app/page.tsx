"use client"
import { ProductTeaserCard } from "@/components/ProductTeaserCard";
import { Navbar } from "@/components/Navbar";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <Navbar />
      <ProductTeaserCard />
    </main>
  );
}
