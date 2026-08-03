import LoginForm from "../LoginForm";
import { getCurrentUser } from "../auth";
import ProjectContractsApp from "./ProjectContractsApp";
import "./project-contracts.css";

export const dynamic = "force-dynamic";

export default async function ProjectContractsPage() {
  const user = await getCurrentUser();
  return user ? <ProjectContractsApp currentUser={user} /> : <LoginForm />;
}
