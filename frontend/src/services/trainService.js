// Training service for frontend API calls
import axios from "axios";

const API_BASE_URL = "http://localhost:8000/api";

export async function getAvailableDatasets() {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/train/datasets`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching datasets:", error);
    throw error;
  }
}

export async function trainModel(payload) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/train/model`,
      payload,
      { timeout: 600000 } // 10 minute timeout for training
    );
    return response.data;
  } catch (error) {
    console.error("Error training model:", error);
    throw error;
  }
}
