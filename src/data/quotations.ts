import { Lead } from "./leads";

export interface Quotation {
  id: string;
  leadId: string;
  leadName: string;
  elevatorType: string;
  floors: number;
  capacity: number;
  speed: number;
  features: string[];
  basePrice: number;
  installationCost: number;
  tax: number;
  totalAmount: number;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  validUntil: string;
  version: number;
}

let quotations: Quotation[] = [
  {
    id: "Q001",
    leadId: "L001",
    leadName: "Rajesh Kumar - Tech Park Developers",
    elevatorType: "Passenger Elevator",
    floors: 10,
    capacity: 1000,
    speed: 1.5,
    features: ["Auto Door", "Emergency Phone", "LED Display"],
    basePrice: 2000000,
    installationCost: 400000,
    tax: 432000,
    totalAmount: 2832000,
    status: "Pending",
    createdAt: "2025-01-20",
    validUntil: "2025-02-20",
    version: 1,
  },
  {
    id: "Q002",
    leadId: "L004",
    leadName: "Sneha Reddy - Luxury Apartments Pvt Ltd",
    elevatorType: "Premium Passenger Elevator",
    floors: 15,
    capacity: 1350,
    speed: 2.0,
    features: ["Auto Door", "Emergency Phone", "LED Display", "Mirror Finish"],
    basePrice: 3500000,
    installationCost: 600000,
    tax: 738000,
    totalAmount: 4838000,
    status: "Approved",
    createdAt: "2025-01-15",
    validUntil: "2025-02-15",
    version: 2,
  },
  {
    id: "Q003",
    leadId: "L002",
    leadName: "Priya Sharma - Green Heights Residency",
    elevatorType: "Passenger Elevator",
    floors: 8,
    capacity: 800,
    speed: 1.0,
    features: ["Auto Door", "Emergency Phone"],
    basePrice: 1500000,
    installationCost: 250000,
    tax: 315000,
    totalAmount: 2065000,
    status: "Pending",
    createdAt: "2025-01-22",
    validUntil: "2025-02-22",
    version: 1,
  },
];

export const getQuotations = () => quotations;
export const getQuotationById = (id: string) => quotations.find(q => q.id === id);
export const addQuotation = (quotation: Omit<Quotation, "id" | "createdAt" | "validUntil" | "version">) => {
  const newQuotation: Quotation = {
    ...quotation,
    id: `Q${String(quotations.length + 1).padStart(3, "0")}`,
    createdAt: new Date().toISOString().split("T")[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    version: 1,
  };
  quotations.push(newQuotation);
  return newQuotation;
};
export const updateQuotation = (id: string, updates: Partial<Quotation>) => {
  const index = quotations.findIndex(q => q.id === id);
  if (index === -1) return null;
  quotations[index] = { ...quotations[index], ...updates };
  return quotations[index];
};
export const deleteQuotation = (id: string) => {
  const index = quotations.findIndex(q => q.id === id);
  if (index === -1) return false;
  quotations.splice(index, 1);
  return true;
};






















