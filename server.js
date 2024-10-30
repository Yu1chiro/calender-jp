import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch'; // Jika kamu belum memiliki fetch, install dengan `npm install node-fetch`

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Konfigurasi path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfigurasi Gemini dengan API key gratis
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cache sederhana untuk menyimpan hasil API
const cache = new Map();

// Serve file statis
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint untuk fetch gambar dari Unsplash
app.get('/api/unsplash', async (req, res) => {
    const query = req.query.query || 'japan matsuri';
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json({ imageUrl: data.urls.regular });
    } catch (error) {
        console.error("Error fetching image from Unsplash:", error);
        res.status(500).json({
            imageUrl: "https://placehold.co/600x400/ff0000/ffffff/png?text=Error"
        });
    }
});

// Endpoint untuk Gemini API
app.get('/api/gemini/:id', async (req, res) => {
    const id = req.params.id;

    // Cek cache dulu
    if (cache.has(id)) {
        console.log("Mengambil data dari cache untuk:", id);
        return res.json(cache.get(id));
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // Prompt yang dioptimalkan untuk respons yang konsisten
        const prompt = `Anda adalah seorang pakar bahasa Jepang dengan pengalaman mengajar lebih dari 30 tahun. Pada kalender Jepang tahun 2024, jelaskan perayaan yang berkaitan "${id}" dan makna dari perayaan tersebut. Gunakan referensi dari jurnal, skripsi, atau artikel akademis yang relevan...
        Berikan dalam format JSON yg rapi seperti contoh berikut:
        {
            "romaji": "[Romaji dalam bahasa Jepang]",
            "title": "[Nama dalam bahasa Jepang]",
            "translation": "[Terjemahan dalam bahasa Indonesia]",
            "description": "[Jelaskan secara singkat 2-3 kalimat]"
        }
        Berikan hanya response JSON, tanpa keterangan tambahan.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Bersihkan dan parse JSON
        let data;
        try {
            // Bersihkan respons dan cari JSON
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/); // Cari pola JSON
        
            if (jsonMatch) {
                // Jika ada pola JSON yang valid, parsing datanya
                data = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Format JSON tidak valid.");
            }
        } catch (parseError) {
            console.error("Terjadi kesalahan saat parsing JSON:", parseError);
        
            // Fallback data jika JSON tidak valid
            data = {
                title: id,
                translation: "Perayaan/Hari Spesial Jepang",
                description: text.slice(0, 200) + "..."  // Gunakan respons mentah sebagai deskripsi
            };
        }
        

        data.image = `https://placehold.co/600x400/87CEEB/ffffff/png?text=${encodeURIComponent(id)}`;

        cache.set(id, data);
        res.json(data);

    } catch (error) {
        console.error("Error Gemini API:", error);
        res.status(500).json({
            title: id,
            translation: "Tidak dapat memuat data",
            image: "https://placehold.co/600x400/ff0000/ffffff/png?text=Error",
            description: "Maaf, terjadi kesalahan saat memuat informasi. Silakan coba lagi nanti."
        });
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
