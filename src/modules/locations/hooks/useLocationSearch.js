import { useState, useCallback, useRef } from 'react';
import { searchLocations, selectLocation, isGooglePlacesAvailable } from '../services/GooglePlacesService';

/**
 * Hook for location search with autocomplete
 * Falls back to local city database when Google Places is not available
 */
export function useLocationSearch() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const debounceRef = useRef(null);
  const googleAvailable = isGooglePlacesAvailable();

  const search = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchLocations(query);
        setSuggestions(results);
      } catch (err) {
        console.warn('Location search error:', err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const select = useCallback(async (prediction) => {
    try {
      const details = await selectLocation(prediction);
      setSelectedLocation(details);
      setSuggestions([]);
      return details;
    } catch (err) {
      console.warn('Location select error:', err);
      // Fallback: use prediction as-is
      const fallback = {
        name: prediction.mainText || prediction.description,
        formattedAddress: prediction.description,
        lat: prediction.lat || null,
        lng: prediction.lng || null,
      };
      setSelectedLocation(fallback);
      setSuggestions([]);
      return fallback;
    }
  }, []);

  const clear = useCallback(() => {
    setSuggestions([]);
    setSelectedLocation(null);
  }, []);

  return {
    suggestions,
    loading,
    selectedLocation,
    search,
    select,
    clear,
    googleAvailable,
  };
}
