export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  stage: "New Lead" | "Lead Contacted" | "Meeting Scheduled" | "Meeting Completed" | "Quotation Sent" | "Manager Deliberation" | "Order Closed" | "Order Lost";
  value: number;
  assignedTo: string;
  createdAt: string;
  lastContact: string;
  notes: string;
}

let leads: Lead[] = [
  {
    id: "L001",
    name: "Rajesh Kumar",
    company: "Tech Park Developers",
    email: "rajesh@techpark.com",
    phone: "+91 98765 43210",
    source: "Website",
    stage: "Quotation Sent",
    value: 2500000,
    assignedTo: "Sales Executive 1",
    createdAt: "2025-01-15",
    lastContact: "2025-01-20",
    notes: "Interested in 2 elevators for new building project",
  },
  {
    id: "L002",
    name: "Priya Sharma",
    company: "Green Heights Residency",
    email: "priya@greenheights.com",
    phone: "+91 98765 43211",
    source: "Referral",
    stage: "Meeting Scheduled",
    value: 1800000,
    assignedTo: "Sales Executive 2",
    createdAt: "2025-01-18",
    lastContact: "2025-01-22",
    notes: "Follow-up scheduled for next week",
  },
  {
    id: "L003",
    name: "Amit Patel",
    company: "Metro Commercial Complex",
    email: "amit@metrocommercial.com",
    phone: "+91 98765 43212",
    source: "Social Media",
    stage: "Lead Contacted",
    value: 3500000,
    assignedTo: "Sales Executive 1",
    createdAt: "2025-01-20",
    lastContact: "2025-01-21",
    notes: "Initial contact made, awaiting response",
  },
  {
    id: "L004",
    name: "Sneha Reddy",
    company: "Luxury Apartments Pvt Ltd",
    email: "sneha@luxuryapts.com",
    phone: "+91 98765 43213",
    source: "Phone Call",
    stage: "Manager Deliberation",
    value: 4200000,
    assignedTo: "Sales Executive 2",
    createdAt: "2025-01-10",
    lastContact: "2025-01-23",
    notes: "Price negotiation in progress",
  },
  {
    id: "L005",
    name: "Vikram Singh",
    company: "Hospitality Group",
    email: "vikram@hospitality.com",
    phone: "+91 98765 43214",
    source: "WhatsApp",
    stage: "New Lead",
    value: 1500000,
    assignedTo: "Sales Executive 1",
    createdAt: "2025-01-24",
    lastContact: "2025-01-24",
    notes: "New lead, needs immediate contact",
  },
  {
    id: "L006",
    name: "Anjali Mehta",
    company: "Shopping Mall Developers",
    email: "anjali@malldev.com",
    phone: "+91 98765 43215",
    source: "Website",
    stage: "Order Closed",
    value: 5500000,
    assignedTo: "Sales Executive 2",
    createdAt: "2025-01-05",
    lastContact: "2025-01-19",
    notes: "Deal closed successfully",
  },
];

export const getLeads = () => leads;
export const getLeadById = (id: string) => leads.find(lead => lead.id === id);
export const addLead = (lead: Omit<Lead, "id" | "createdAt" | "lastContact">) => {
  const newLead: Lead = {
    ...lead,
    id: `L${String(leads.length + 1).padStart(3, "0")}`,
    createdAt: new Date().toISOString().split("T")[0],
    lastContact: new Date().toISOString().split("T")[0],
  };
  leads.push(newLead);
  return newLead;
};
export const updateLead = (id: string, updates: Partial<Lead>) => {
  const index = leads.findIndex(lead => lead.id === id);
  if (index === -1) return null;
  leads[index] = { ...leads[index], ...updates };
  return leads[index];
};
export const deleteLead = (id: string) => {
  const index = leads.findIndex(lead => lead.id === id);
  if (index === -1) return false;
  leads.splice(index, 1);
  return true;
};






















