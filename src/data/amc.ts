export interface AMCContract {
  id: string;
  customerName: string;
  projectName: string;
  elevatorId: string;
  contractStartDate: string;
  contractEndDate: string;
  duration: number;
  nextServiceDate: string;
  serviceFrequency: string;
  assignedTechnician: string;
  status: "Active" | "Expired" | "Pending Renewal";
  totalValue: number;
  servicesCompleted: number;
  servicesPending: number;
}

let amcContracts: AMCContract[] = [
  {
    id: "AMC001",
    customerName: "Sneha Reddy",
    projectName: "Luxury Apartments - Building A",
    elevatorId: "ELE-001",
    contractStartDate: "2024-06-01",
    contractEndDate: "2025-05-31",
    duration: 12,
    nextServiceDate: "2025-02-05",
    serviceFrequency: "Monthly",
    assignedTechnician: "Technician 1",
    status: "Active",
    totalValue: 120000,
    servicesCompleted: 8,
    servicesPending: 4,
  },
  {
    id: "AMC002",
    customerName: "Rajesh Kumar",
    projectName: "Tech Park - Tower 1",
    elevatorId: "ELE-002",
    contractStartDate: "2024-09-01",
    contractEndDate: "2025-08-31",
    duration: 12,
    nextServiceDate: "2025-02-10",
    serviceFrequency: "Monthly",
    assignedTechnician: "Technician 2",
    status: "Active",
    totalValue: 150000,
    servicesCompleted: 5,
    servicesPending: 7,
  },
  {
    id: "AMC003",
    customerName: "Anjali Mehta",
    projectName: "Shopping Mall - Main Building",
    elevatorId: "ELE-003",
    contractStartDate: "2023-12-01",
    contractEndDate: "2024-11-30",
    duration: 12,
    nextServiceDate: "2025-02-01",
    serviceFrequency: "Monthly",
    assignedTechnician: "Technician 1",
    status: "Pending Renewal",
    totalValue: 200000,
    servicesCompleted: 12,
    servicesPending: 0,
  },
  {
    id: "AMC004",
    customerName: "Vikram Singh",
    projectName: "Hospitality Group - Hotel",
    elevatorId: "ELE-004",
    contractStartDate: "2024-03-01",
    contractEndDate: "2025-02-28",
    duration: 12,
    nextServiceDate: "2025-02-15",
    serviceFrequency: "Quarterly",
    assignedTechnician: "Technician 2",
    status: "Active",
    totalValue: 180000,
    servicesCompleted: 3,
    servicesPending: 1,
  },
];

export const getAMCContracts = () => amcContracts;
export const getAMCById = (id: string) => amcContracts.find(amc => amc.id === id);
export const addAMC = (amc: Omit<AMCContract, "id">) => {
  const newAMC: AMCContract = {
    ...amc,
    id: `AMC${String(amcContracts.length + 1).padStart(3, "0")}`,
  };
  amcContracts.push(newAMC);
  return newAMC;
};
export const updateAMC = (id: string, updates: Partial<AMCContract>) => {
  const index = amcContracts.findIndex(amc => amc.id === id);
  if (index === -1) return null;
  amcContracts[index] = { ...amcContracts[index], ...updates };
  return amcContracts[index];
};
export const deleteAMC = (id: string) => {
  const index = amcContracts.findIndex(amc => amc.id === id);
  if (index === -1) return false;
  amcContracts.splice(index, 1);
  return true;
};






















