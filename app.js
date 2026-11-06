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

    let selectedStop = null;
    let searchTimer = null;
    let searchController = null;
    let refreshTimer = null;
    let activeSuggestion = -1;
    let suggestions = [];
    let isLoadingDepartures = false;
    let autoRefreshEnabled = true;
    let lastDepartures = [];

    function isProxyConfigured() {
      return !API_BASE.includes("YOUR-SUBDOMAIN");
    }

    function setSearchHint(message, isError = false) {
      searchHint.textContent = message;
      searchHint.className = `mt-4 min-h-4 text-xs leading-5 ${isError ? "text-[#b45345]" : "text-[#849087]"}`;
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
      try {
        const data = await response.json();
        detail = data.message || data.error || "";
      } catch {
        detail = "";
      }

      if (response.status === 401 || response.status === 403) {
        return "Trafiklab avvisade API-nyckeln. Kontrollera att nyckeln är korrekt och aktiverad för Realtime APIs.";
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

    setInterval(() => {
      if (lastDepartures.length && !departuresList.classList.contains("hidden")) {
        renderDepartures(lastDepartures);
      }
    }, 15_000);

    if (!isProxyConfigured()) {
      setSearchHint("Ange din Cloudflare Worker-adress i API_BASE högst upp i app.js.", true);
    }
