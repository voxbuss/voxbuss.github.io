    const API_BASE = "https://throbbing-resonance-97a6.vilmerolof55.workers.dev/v1";
    const REFRESH_INTERVAL_MS = 60_000;
    const VARMLAND_BOUNDS = { minLat: 58.5, maxLat: 61.5, minLon: 11, maxLon: 14.8 };

    const searchInput = document.getElementById("stop-search");
    const suggestionsElement = document.getElementById("suggestions");
    const searchHint = document.getElementById("search-hint");
    const selectedStopName = document.getElementById("selected-stop-name");
    const departuresList = document.getElementById("departures-list");
    const boardEmpty = document.getElementById("board-empty");
    const boardContent = document.getElementById("board-content");
    const boardFooter = document.getElementById("board-footer");
    const refreshIndicator = document.getElementById("refresh-indicator");
    const refreshNowButton = document.getElementById("refresh-now");
    const autoRefreshButton = document.getElementById("auto-refresh");
    const emptyTitle = document.getElementById("empty-title");
    const emptyMessage = document.getElementById("empty-message");
    const emptyAction = document.getElementById("empty-action");
    const favoriteStopButton = document.getElementById("favorite-stop");
    const favoritesSection = document.getElementById("favorites-section");
    const favoritesList = document.getElementById("favorites-list");
    const plannerForm = document.getElementById("planner-form");
    const plannerFromInput = document.getElementById("planner-from");
    const plannerToInput = document.getElementById("planner-to");
    const plannerFromOptions = document.getElementById("planner-from-options");
    const plannerToOptions = document.getElementById("planner-to-options");
    const plannerStatus = document.getElementById("planner-status");
    const plannerResults = document.getElementById("planner-results");
    const plannerSubmit = document.getElementById("planner-submit");
    const mapStatus = document.getElementById("map-status");

    let selectedStop = null;
    let favorites = [];
    let searchTimer = null;
    let searchController = null;
    let refreshTimer = null;
    let activeSuggestion = -1;
    let suggestions = [];
    let isLoadingDepartures = false;
    let autoRefreshEnabled = true;
    let lastDepartures = [];
    let plannerFromStop = null;
    let plannerToStop = null;
    let plannerSearchTimers = new Map();
    let plannerSearchControllers = new Map();
    let vehicleMap = null;
    let vehicleMarkers = new Map();
    let vehicleMapHasFitted = false;

    function isProxyConfigured() {
      return !API_BASE.includes("YOUR-SUBDOMAIN");
    }

    function setSearchHint(message, isError = false) {
      searchHint.textContent = message;
      searchHint.className = `mt-4 min-h-4 text-xs leading-5 ${isError ? "text-[#b45345]" : "text-[#849087]"}`;
    }

    function setPlannerStatus(message, isError = false) {
      plannerStatus.textContent = message;
      plannerStatus.className = `mt-4 text-sm ${isError ? "text-[#b45345]" : "text-[#849087]"}`;
    }

    function renderPlannerOptions(list, stops, selectStopCallback) {
      list.replaceChildren();
      for (const stop of stops) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "suggestion-item";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        const name = document.createElement("span");
        name.className = "text-sm font-semibold text-[#304239]";
        name.textContent = stop.name;
        const arrow = document.createElement("span");
        arrow.className = "ml-auto text-lg text-[#9aa59b]";
        arrow.textContent = "›";
        option.append(name, arrow);
        option.addEventListener("click", () => selectStopCallback(stop));
        list.append(option);
      }
      list.classList.toggle("hidden", stops.length === 0);
      const input = list === plannerFromOptions ? plannerFromInput : plannerToInput;
      input.setAttribute("aria-expanded", String(stops.length > 0));
    }

    function setupPlannerStopSearch(input, list, direction) {
      input.addEventListener("input", () => {
        const query = input.value.trim();
        const timers = plannerSearchTimers;
        const controllers = plannerSearchControllers;
        const previousTimer = timers.get(direction);
        if (previousTimer) clearTimeout(previousTimer);
        controllers.get(direction)?.abort();

        if (direction === "from") plannerFromStop = null;
        else plannerToStop = null;

        if (query.length < 2) {
          list.replaceChildren();
          list.classList.add("hidden");
          input.setAttribute("aria-expanded", "false");
          return;
        }

        timers.set(direction, setTimeout(async () => {
          if (!isProxyConfigured()) {
            setPlannerStatus("API-proxyn är inte konfigurerad.", true);
            return;
          }

          const controller = new AbortController();
          controllers.set(direction, controller);
          setPlannerStatus("Söker hållplatser …");

          try {
            const response = await fetch(
              `${API_BASE}/stops/name/${encodeURIComponent(query)}`,
              { signal: controller.signal }
            );
            if (!response.ok) throw new Error(await getApiError(response));
            const data = await response.json();
            if (input.value.trim() !== query) return;
            const stops = (data.stop_groups || []).filter(isInVärmland).slice(0, 6);
            renderPlannerOptions(list, stops, (stop) => {
              input.value = stop.name;
              if (direction === "from") plannerFromStop = stop;
              else plannerToStop = stop;
              list.replaceChildren();
              list.classList.add("hidden");
              input.setAttribute("aria-expanded", "false");
              setPlannerStatus("Välj start och destination bland hållplatserna i Värmland.");
            });
            setPlannerStatus(stops.length
              ? "Välj en hållplats från förslagen."
              : "Hittade inga hållplatser i Värmland med det namnet.", !stops.length);
          } catch (error) {
            if (error.name !== "AbortError") setPlannerStatus(error.message, true);
          }
        }, 300));
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          list.replaceChildren();
          list.classList.add("hidden");
          input.setAttribute("aria-expanded", "false");
        }
      });
    }

    function appendText(parent, tag, className, text) {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      parent.append(element);
      return element;
    }

    function renderTrips(data) {
      const trips = Array.isArray(data.Trip) ? data.Trip : data.Trip ? [data.Trip] : [];
      plannerResults.replaceChildren();
      plannerResults.classList.toggle("hidden", trips.length === 0);

      for (const trip of trips) {
        const card = document.createElement("article");
        card.className = "rounded-2xl border border-[#e5e9e2] bg-[#fbfcfa] p-4 sm:p-5";
        const legs = trip.LegList?.Leg;
        const legList = Array.isArray(legs) ? legs : legs ? [legs] : [];
        const firstLeg = legList[0];
        const lastLeg = legList[legList.length - 1];
        const start = firstLeg?.Origin;
        const end = lastLeg?.Destination;
        const summary = document.createElement("div");
        summary.className = "flex flex-wrap items-center justify-between gap-2";
        appendText(summary, "p", "font-semibold text-[#304239]", `${start?.time || "—"} → ${end?.time || "—"}`);
        appendText(summary, "p", "text-xs font-medium text-[#718078]", trip.duration || "");
        card.append(summary);

        const details = document.createElement("div");
        details.className = "mt-3 space-y-2";
        for (const leg of legList) {
          const row = document.createElement("div");
          row.className = "flex flex-wrap gap-x-2 text-sm text-[#52615a]";
          const mode = leg.Product?.name || (leg.type === "WALK" ? "Promenad" : "Byte");
          const fromName = leg.Origin?.name || "Start";
          const toName = leg.Destination?.name || "Destination";
          appendText(row, "span", "font-semibold text-[#385a40]", mode);
          appendText(row, "span", "min-w-0 flex-1", `${fromName} ${leg.Origin?.time || ""} → ${toName} ${leg.Destination?.time || ""}`);
          details.append(row);
        }
        card.append(details);
        plannerResults.append(card);
      }

      if (!trips.length) {
        setPlannerStatus("Hittade inga resor mellan de här hållplatserna. Prova andra hållplatser eller tider.", false);
      } else {
        setPlannerStatus(`${trips.length} reseförslag från ResRobot.`);
      }
    }

    async function planJourney(event) {
      event.preventDefault();
      plannerResults.replaceChildren();
      plannerResults.classList.add("hidden");

      if (!plannerFromStop || !plannerToStop) {
        setPlannerStatus("Välj både startplats och destination bland sökförslagen.", true);
        return;
      }
      if (String(plannerFromStop.id) === String(plannerToStop.id)) {
        setPlannerStatus("Välj två olika hållplatser.", true);
        return;
      }

      plannerSubmit.disabled = true;
      setPlannerStatus("Hämtar reseförslag …");
      try {
        const query = new URLSearchParams({
          originId: plannerFromStop.id,
          destinationId: plannerToStop.id
        });
        const response = await fetch(`${API_BASE}/trips?${query}`);
        if (!response.ok) throw new Error(await getApiError(response));
        renderTrips(await response.json());
      } catch (error) {
        setPlannerStatus(error.message, true);
      } finally {
        plannerSubmit.disabled = false;
      }
    }

    function initializeVehicleMap() {
      if (!window.L) {
        mapStatus.textContent = "Kartan kunde inte laddas. Kontrollera anslutningen och försök igen.";
        return;
      }

      vehicleMap = L.map("vehicle-map").setView([59.5, 13.3], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(vehicleMap);

      updateVehiclePositions();
      setInterval(updateVehiclePositions, 30_000);
    }

    function createVehiclePopup(vehicle) {
      const popup = document.createElement("div");
      const label = vehicle.label || vehicle.routeId || "Värmlandstrafik";
      appendText(popup, "strong", "", `Buss ${label}`);
      if (vehicle.tripId) appendText(popup, "div", "", `Tur ${vehicle.tripId}`);
      if (vehicle.timestamp) {
        appendText(popup, "div", "", `Position ${formatClock(new Date(vehicle.timestamp * 1000))}`);
      }
      return popup;
    }

    async function updateVehiclePositions() {
      if (!vehicleMap) return;
      try {
        const response = await fetch(`${API_BASE}/vehicles`);
        if (!response.ok) throw new Error(await getApiError(response));
        const data = await response.json();
        const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
        const currentIds = new Set();
        const busIcon = L.divIcon({
          className: "",
          html: '<span class="vehicle-marker" aria-hidden="true">B</span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });

        for (const vehicle of vehicles) {
          if (!Number.isFinite(vehicle.latitude) || !Number.isFinite(vehicle.longitude)) continue;
          const id = vehicle.id || vehicle.vehicleId || `${vehicle.latitude},${vehicle.longitude}`;
          currentIds.add(id);
          const location = [vehicle.latitude, vehicle.longitude];
          const marker = vehicleMarkers.get(id);
          if (marker) {
            marker.setLatLng(location);
            marker.setPopupContent(createVehiclePopup(vehicle));
          } else {
            vehicleMarkers.set(id, L.marker(location, { icon: busIcon })
              .bindPopup(createVehiclePopup(vehicle))
              .addTo(vehicleMap));
          }
        }

        for (const [id, marker] of vehicleMarkers) {
          if (!currentIds.has(id)) {
            marker.remove();
            vehicleMarkers.delete(id);
          }
        }

        if (!vehicleMapHasFitted && vehicles.length) {
          const markers = [...vehicleMarkers.values()];
          if (markers.length) vehicleMap.fitBounds(L.featureGroup(markers).getBounds().pad(0.12), { maxZoom: 11 });
          vehicleMapHasFitted = true;
        }

        const updatedAt = data.timestamp ? formatClock(new Date(data.timestamp * 1000)) : formatClock(new Date());
        const vehicleCount = vehicles.length === 1 ? "1 buss" : `${vehicles.length} bussar`;
        mapStatus.textContent = vehicles.length
          ? `${vehicleCount} på kartan · Uppdaterad ${updatedAt}`
          : `Inga aktiva fordonspositioner just nu · Uppdaterad ${updatedAt}`;
      } catch (error) {
        mapStatus.textContent = `Kunde inte hämta fordonspositioner: ${error.message}`;
      }
    }

    function loadFavorites() {
      try {
        const saved = JSON.parse(localStorage.getItem("voxbuss:favorites:v1") || "[]");
        if (!Array.isArray(saved)) throw new Error("Invalid favorites data");
        favorites = saved.filter((stop) =>
          stop && /^\d+$/.test(String(stop.id)) && typeof stop.name === "string"
        );
        renderFavorites();
      } catch {
        favorites = [];
        renderFavorites();
        setSearchHint("Favoriter kunde inte läsas i den här webbläsaren.", true);
      }
    }

    function saveFavorites(nextFavorites) {
      try {
        localStorage.setItem("voxbuss:favorites:v1", JSON.stringify(nextFavorites));
        favorites = nextFavorites;
        renderFavorites();
        updateFavoriteButton();
        return true;
      } catch {
        setSearchHint("Favoriten kunde inte sparas. Kontrollera webbläsarens lagringsinställningar.", true);
        return false;
      }
    }

    function renderFavorites() {
      favoritesList.replaceChildren();
      favoritesSection.classList.toggle("hidden", favorites.length === 0);

      for (const stop of favorites) {
        const item = document.createElement("div");
        item.className = "favorite-item";

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = "favorite-chip";
        selectButton.textContent = stop.name;
        selectButton.title = `Näytä avgångar från ${stop.name}`;
        selectButton.addEventListener("click", () => selectStop(stop));

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "favorite-remove";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `Ta bort ${stop.name} från favoriter`);
        removeButton.addEventListener("click", () => removeFavorite(stop.id));

        item.append(selectButton, removeButton);
        favoritesList.append(item);
      }
    }

    function isFavorite(stop) {
      return favorites.some((favorite) => String(favorite.id) === String(stop.id));
    }

    function updateFavoriteButton() {
      const saved = Boolean(selectedStop && isFavorite(selectedStop));
      favoriteStopButton.setAttribute("aria-pressed", String(saved));
      favoriteStopButton.setAttribute(
        "aria-label",
        saved ? "Ta bort hållplats från favoriter" : "Spara hållplats som favorit"
      );
      favoriteStopButton.innerHTML = `<span aria-hidden="true">${saved ? "★" : "☆"}</span> ${saved ? "Sparad" : "Spara favorit"}`;
      favoriteStopButton.classList.toggle("text-[#507b40]", saved);
    }

    function toggleFavorite() {
      if (!selectedStop) return;
      if (isFavorite(selectedStop)) {
        removeFavorite(selectedStop.id);
        return;
      }

      const stopToSave = {
        id: String(selectedStop.id),
        name: selectedStop.name,
        area_type: selectedStop.area_type || "RIKSHALLPLATS"
      };
      saveFavorites([...favorites, stopToSave]);
    }

    function removeFavorite(stopId) {
      saveFavorites(favorites.filter((stop) => String(stop.id) !== String(stopId)));
    }

    function showSuggestions(items) {
      suggestions = items;
      activeSuggestion = -1;
      suggestionsElement.replaceChildren();

      if (!items.length) {
        hideSuggestions();
        return;
      }

      for (const [index, stop] of items.entries()) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "suggestion-item";
        option.id = `stop-suggestion-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");

        const icon = document.createElement("span");
        icon.className = "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0f5eb] text-[#5b8050]";
        icon.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="9" r="2.3" stroke="currentColor" stroke-width="1.7"/></svg>';

        const details = document.createElement("span");
        details.className = "min-w-0 flex-1";
        const name = document.createElement("span");
        name.className = "block truncate text-sm font-semibold text-[#304239]";
        name.textContent = stop.name;
        const meta = document.createElement("span");
        meta.className = "mt-0.5 block text-xs text-[#8b958d]";
        meta.textContent = `${stop.area_type === "META_STOP" ? "Område" : "Hållplats"} · Värmland`;
        details.append(name, meta);

        const arrow = document.createElement("span");
        arrow.className = "text-lg text-[#9aa59b]";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "›";
        option.append(icon, details, arrow);
        option.addEventListener("click", () => selectStop(stop));
        suggestionsElement.append(option);
      }

      suggestionsElement.classList.remove("hidden");
      searchInput.setAttribute("aria-expanded", "true");
    }

    function hideSuggestions() {
      suggestionsElement.classList.add("hidden");
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.removeAttribute("aria-activedescendant");
      activeSuggestion = -1;
    }

    function updateActiveSuggestion(nextIndex) {
      if (!suggestions.length) return;
      activeSuggestion = (nextIndex + suggestions.length) % suggestions.length;
      [...suggestionsElement.children].forEach((option, index) => {
        option.setAttribute("aria-selected", String(index === activeSuggestion));
      });
      searchInput.setAttribute("aria-activedescendant", `stop-suggestion-${activeSuggestion}`);
      suggestionsElement.children[activeSuggestion].scrollIntoView({ block: "nearest" });
    }

    function isInVärmland(stopGroup) {
      return (stopGroup.stops || []).some((stop) =>
        Number.isFinite(stop.lat) && Number.isFinite(stop.lon) &&
        stop.lat >= VARMLAND_BOUNDS.minLat && stop.lat <= VARMLAND_BOUNDS.maxLat &&
        stop.lon >= VARMLAND_BOUNDS.minLon && stop.lon <= VARMLAND_BOUNDS.maxLon
      );
    }

    async function searchStops(query) {
      if (!isProxyConfigured()) {
        setSearchHint("Ange din Cloudflare Worker-adress i API_BASE högst upp i app.js.", true);
        return;
      }

      if (searchController) searchController.abort();
      searchController = new AbortController();
      setSearchHint("Letar efter hållplatser …");

      try {
        const url = `${API_BASE}/stops/name/${encodeURIComponent(query)}`;
        const response = await fetch(url, { signal: searchController.signal });
        if (!response.ok) throw new Error(await getApiError(response));

        const data = await response.json();
        const matches = (data.stop_groups || []).filter(isInVärmland).slice(0, 7);
        if (searchInput.value.trim() !== query) return;

        if (matches.length) {
          setSearchHint(`${matches.length} hållplats${matches.length === 1 ? "" : "er"} i Värmland`);
          showSuggestions(matches);
        } else {
          hideSuggestions();
          setSearchHint("Hittade ingen hållplats i Värmland. Prova ett annat namn.");
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        hideSuggestions();
        setSearchHint(error.message, true);
      }
    }

    async function getApiError(response) {
      let detail = "";
      let upstreamStatus = null;
      try {
        const data = await response.json();
        detail = data.message || data.error || "";
        upstreamStatus = data.status || null;
      } catch {
        detail = "";
      }

      if (response.status === 403 && detail === "Origin not allowed.") {
        return "Cloudflare Worker avvisade webbplatsens origin. Kontrollera inställningen ALLOWED_ORIGIN.";
      }
      if (response.status === 401 || response.status === 403) {
        if (detail === "ResRobot route request failed." && (upstreamStatus === 401 || upstreamStatus === 403)) {
          return "ResRobot avvisade API-nyckeln. Kontrollera att nyckeln är aktiv för ResRobot v2.1.";
        }
        if (detail === "GTFS Regional vehicle-position request failed." && (upstreamStatus === 401 || upstreamStatus === 403)) {
          return "Trafiklab avvisade GTFS Regional Realtime-nyckeln. Kontrollera att den är aktiv för GTFS Regional.";
        }
        if (detail === "Trafiklab request failed." && (upstreamStatus === 401 || upstreamStatus === 403)) {
          return "Trafiklab avvisade Worker-nyckeln. Kontrollera att nyckeln är aktiv för API:t.";
        }
        return "Begäran nekades. Kontrollera Cloudflare Workers-inställningarna och Trafiklab-nyckeln.";
      }
      if (response.status === 503 && detail === "The ResRobot API key is not configured.") {
        return "ResRobot-nyckeln saknas i Cloudflare Worker. Lägg till RESROBOT_API_KEY som en secret.";
      }
      if (response.status === 503 && detail === "The GTFS Regional Realtime API key is not configured.") {
        return "Nyckel för GTFS Regional Realtime saknas i Cloudflare Worker. Lägg till GTFS_REGIONAL_REALTIME_API_KEY som en secret.";
      }
      if (response.status === 429) return "Trafiklabs gräns för API-anrop är nådd. Vänta en stund och försök igen.";
      return detail || `Trafiklab svarade med fel ${response.status}. Försök igen senare.`;
    }

    function setBoardState(title, message, actionLabel = "", action = null) {
      departuresList.classList.add("hidden");
      boardFooter.classList.add("hidden");
      boardEmpty.classList.remove("hidden");
      emptyTitle.textContent = title;
      emptyMessage.textContent = message;
      emptyAction.classList.toggle("hidden", !actionLabel);
      emptyAction.textContent = actionLabel;
      emptyAction.onclick = action;
    }

    function selectStop(stop) {
      selectedStop = stop;
      searchInput.value = stop.name;
      selectedStopName.textContent = stop.name;
      favoriteStopButton.classList.remove("hidden");
      updateFavoriteButton();
      hideSuggestions();
      searchInput.blur();
      refreshNowButton.disabled = false;
      document.getElementById("live-badge").classList.remove("hidden");
      document.getElementById("live-badge").classList.add("inline-flex");
      setSearchHint(`Visar avgångar från ${stop.name}.`);
      loadDepartures();
      startAutoRefresh();
    }

    function startAutoRefresh() {
      if (refreshTimer) clearInterval(refreshTimer);
      if (autoRefreshEnabled && selectedStop) {
        refreshTimer = setInterval(() => loadDepartures({ silent: true }), REFRESH_INTERVAL_MS);
      }
    }

    async function loadDepartures({ silent = false } = {}) {
      if (!selectedStop || isLoadingDepartures) return;
      if (!isProxyConfigured()) {
        setBoardState("API-proxy saknas", "Ange din Cloudflare Worker-adress i API_BASE högst upp i app.js.");
        setSearchHint("Ange din Cloudflare Worker-adress i API_BASE högst upp i app.js.", true);
        return;
      }

      isLoadingDepartures = true;
      boardContent.setAttribute("aria-busy", "true");
      refreshIndicator.classList.remove("hidden");
      refreshNowButton.disabled = true;
      if (!silent && !lastDepartures.length) {
        boardEmpty.classList.remove("hidden");
        departuresList.classList.add("hidden");
        emptyTitle.textContent = "Hämtar avgångar";
        emptyMessage.textContent = `Letar efter bussar från ${selectedStop.name} …`;
        emptyAction.classList.add("hidden");
      }

      try {
        const url = `${API_BASE}/departures/${encodeURIComponent(selectedStop.id)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(await getApiError(response));
        const data = await response.json();
        const busDepartures = (data.departures || [])
          .filter((departure) => {
            const mode = String(departure.route?.transport_mode || "").toUpperCase();
            return mode === "BUS" && !departure.canceled;
          })
          .sort((a, b) => departureTimestamp(a) - departureTimestamp(b));

        lastDepartures = busDepartures;
        if (!busDepartures.length) {
          setBoardState(
            "Inga bussar just nu",
            "Det finns inga kommande bussavgångar från den här hållplatsen den närmaste timmen."
          );
        } else {
          renderDepartures(busDepartures);
        }
        const updatedAt = data.timestamp ? new Date(data.timestamp) : new Date();
        document.getElementById("last-updated").textContent = `Senast uppdaterad ${formatClock(updatedAt)}`;
        boardFooter.classList.remove("hidden");
        boardFooter.classList.add("flex");
      } catch (error) {
        if (!silent || !lastDepartures.length) {
          setBoardState("Kunde inte hämta avgångar", error.message, "Försök igen", () => loadDepartures());
        } else {
          setSearchHint(`Kunde inte uppdatera avgångarna: ${error.message}`, true);
        }
      } finally {
        isLoadingDepartures = false;
        boardContent.setAttribute("aria-busy", "false");
        refreshIndicator.classList.add("hidden");
        refreshNowButton.disabled = !selectedStop;
      }
    }

    function departureTimestamp(departure) {
      const time = departure.realtime || departure.scheduled;
      return time ? new Date(time).getTime() : Number.MAX_SAFE_INTEGER;
    }

    function formatClock(date) {
      return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(date);
    }

    function formatDepartureTime(value) {
      if (!value) return "—";
      return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    }

    function formatCountdown(value) {
      const minutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60_000);
      if (minutes <= 0) return "Nu";
      return `${minutes} min`;
    }

    function renderDepartures(departures) {
      boardEmpty.classList.add("hidden");
      departuresList.classList.remove("hidden");
      departuresList.replaceChildren();
      const visibleDepartures = departures.slice(0, 12);

      for (const departure of visibleDepartures) {
        const route = departure.route || {};
        const scheduled = departure.scheduled;
        const realtime = departure.realtime || scheduled;
        const departureTime = realtime;
        const delayMinutes = scheduled && realtime
          ? Math.round((new Date(realtime).getTime() - new Date(scheduled).getTime()) / 60_000)
          : 0;
        const platform = departure.realtime_platform?.designation || departure.scheduled_platform?.designation;

        const row = document.createElement("article");
        row.className = "departure-row flex items-center gap-3 py-4 sm:gap-5 sm:py-[18px]";
        row.setAttribute("role", "listitem");

        const lineBadge = document.createElement("span");
        lineBadge.className = "line-badge";
        lineBadge.textContent = route.designation || route.name || "BUS";
        lineBadge.setAttribute("aria-label", `Linje ${lineBadge.textContent}`);
        row.append(lineBadge);

        const details = document.createElement("div");
        details.className = "min-w-0 flex-1";
        const destination = document.createElement("p");
        destination.className = "truncate text-sm font-semibold text-[#304239] sm:text-[15px]";
        destination.textContent = route.direction || route.destination?.name || "Okänd destination";
        const meta = document.createElement("div");
        meta.className = "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#89938b]";
        if (platform) {
          const platformLabel = document.createElement("span");
          platformLabel.textContent = `Läge ${platform}`;
          meta.append(platformLabel);
        }
        if (delayMinutes > 0) {
          const delay = document.createElement("span");
          delay.className = "font-semibold text-[#b65b42]";
          delay.textContent = `+${delayMinutes} min`;
          meta.append(delay);
        } else if (delayMinutes < 0) {
          const early = document.createElement("span");
          early.className = "font-semibold text-[#507d45]";
          early.textContent = `${Math.abs(delayMinutes)} min tidigare`;
          meta.append(early);
        } else if (departure.agency?.name) {
          const agency = document.createElement("span");
          agency.textContent = departure.agency.name;
          meta.append(agency);
        }
        details.append(destination, meta);
        row.append(details);

        const timeColumn = document.createElement("div");
        timeColumn.className = "shrink-0 text-right";
        const time = document.createElement("p");
        time.className = `text-lg font-semibold tabular-nums tracking-[-.04em] ${delayMinutes > 0 ? "text-[#b65b42]" : "text-[#20392f]"}`;
        time.textContent = formatDepartureTime(departureTime);
        const countdown = document.createElement("p");
        countdown.className = "mt-0.5 text-xs font-medium text-[#869188]";
        countdown.textContent = formatCountdown(departureTime);
        timeColumn.append(time, countdown);
        row.append(timeColumn);

        if (scheduled && realtime && delayMinutes !== 0) {
          time.title = `Tidtabell ${formatDepartureTime(scheduled)}`;
          time.setAttribute("aria-label", `Beräknad avgång ${formatDepartureTime(realtime)}, tidtabell ${formatDepartureTime(scheduled)}`);
        }
        departuresList.append(row);
      }
    }

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (searchController) searchController.abort();
      if (query.length < 2) {
        hideSuggestions();
        setSearchHint(query ? "Skriv minst två tecken för att söka." : "Hållplatser visas bara för Värmland.");
        return;
      }
      searchTimer = setTimeout(() => searchStops(query), 300);
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && suggestions.length) {
        event.preventDefault();
        updateActiveSuggestion(activeSuggestion + 1);
      } else if (event.key === "ArrowUp" && suggestions.length) {
        event.preventDefault();
        updateActiveSuggestion(activeSuggestion - 1);
      } else if (event.key === "Enter" && activeSuggestion >= 0) {
        event.preventDefault();
        selectStop(suggestions[activeSuggestion]);
      } else if (event.key === "Escape") {
        hideSuggestions();
      }
    });

    document.addEventListener("click", (event) => {
      if (!suggestionsElement.contains(event.target) && event.target !== searchInput) hideSuggestions();
    });

    document.querySelectorAll(".search-example").forEach((button) => {
      button.addEventListener("click", () => {
        searchInput.value = button.dataset.query;
        searchInput.focus();
        searchStops(button.dataset.query);
      });
    });

    autoRefreshButton.addEventListener("click", () => {
      autoRefreshEnabled = !autoRefreshEnabled;
      autoRefreshButton.setAttribute("aria-checked", String(autoRefreshEnabled));
      autoRefreshButton.setAttribute("aria-label", `Uppdatera automatiskt ${autoRefreshEnabled ? "var 60:e sekund" : "av"}`);
      autoRefreshButton.title = `Uppdatera automatiskt ${autoRefreshEnabled ? "var 60:e sekund" : "av"}`;
      autoRefreshButton.classList.toggle("bg-[#315c39]", autoRefreshEnabled);
      autoRefreshButton.classList.toggle("bg-[#c6cec5]", !autoRefreshEnabled);
      const knob = autoRefreshButton.firstElementChild;
      knob.classList.toggle("right-1", autoRefreshEnabled);
      knob.classList.toggle("left-1", !autoRefreshEnabled);
      startAutoRefresh();
    });

    refreshNowButton.addEventListener("click", () => loadDepartures());
    favoriteStopButton.addEventListener("click", toggleFavorite);
    setupPlannerStopSearch(plannerFromInput, plannerFromOptions, "from");
    setupPlannerStopSearch(plannerToInput, plannerToOptions, "to");
    plannerForm.addEventListener("submit", planJourney);

    setInterval(() => {
      if (lastDepartures.length && !departuresList.classList.contains("hidden")) {
        renderDepartures(lastDepartures);
      }
    }, 15_000);

    loadFavorites();
    initializeVehicleMap();

    if (!isProxyConfigured()) {
      setSearchHint("Ange din Cloudflare Worker-adress i API_BASE högst upp i app.js.", true);
    }
