// Import necessary components and functions from react-router-dom.

import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
} from "react-router-dom";
import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import { Shelter } from "./pages/Shelter";

export const router = createBrowserRouter(
    createRoutesFromElements(
      <>
        {/* Home publico (ciudadano): mapa de shelters + donar/voluntario/vehiculo.
            Va dentro del Layout para conservar Navbar/Footer si los usas. */}
        <Route path="/" element={<Layout />} errorElement={<h1>Not found!</h1>}>
          <Route path="/" element={<Home />} />
        </Route>

        {/* Panel de shelter: clave -> seleccionar shelter -> gestionar todo.
            Fuera del Layout porque trae su propia barra superior. */}
        <Route path="/shelter" element={<Shelter />} errorElement={<h1>Not found!</h1>} />
      </>
    )
);