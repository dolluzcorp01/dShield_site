import React, { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Navbar from "./Navbar";
import Home from "./Home";
import Result from "./Result";
import Pricing from "./Pricing";
import { ToolsIndex, ToolPage } from "./Tools";
import Services from "./Services";
import Coverage from "./Coverage";
import { LegalIndex, Legal, DataRequest } from "./Legal";
import Preferences from "./Preferences";
import { Contact, HowItWorks, Trust, Footer, NotFound } from "./Pages";
import "./App.css";

/* Router keeps scroll position between pages, which on a marketing site means
   arriving halfway down the page you just navigated to. */
function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
}

function App() {
    return (
        <div className="app">
            <ScrollToTop />
            <Navbar />
            <main className="app__main">
                {/* ⚠️  A NEW ROUTE MUST ALSO BE ADDED TO src/utils/routes.js.
                    That list is what server.js uses to decide 200 vs 404 in
                    production. A route added here and forgotten there still
                    renders perfectly for a person — it just carries a 404
                    status, so crawlers drop it and nobody notices. */}
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/result/:id" element={<Result />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/tools" element={<ToolsIndex />} />
                    <Route path="/tools/:slug" element={<ToolPage />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/coverage" element={<Coverage />} />
                    <Route path="/how-it-works" element={<HowItWorks />} />
                    <Route path="/trust" element={<Trust />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/legal" element={<LegalIndex />} />
                    <Route path="/legal/:key" element={<Legal />} />
                    <Route path="/preferences/:token" element={<Preferences />} />
                    <Route path="/data-request" element={<DataRequest />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
}

export default App;
