import Route from '../models/Route.js'; // Correctly import the Route model

export const routeController = {
    // ✅ Fetch all routes
    getAllRoutes: async (req, res) => {
        try {
            const routes = await Route.find();  // Fetch all routes
            res.json(routes);  // Return them as a JSON response
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ✅ Fetch a single route by ID
    getRouteById: async (req, res) => {
        try {
            const route = await Route.findById(req.params.id);
            if (!route) {
                return res.status(404).json({ message: 'Route not found' });
            }
            res.json(route);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // ✅ Create a new route
    createRoute: async (req, res) => {
        try {
            const newRoute = new Route(req.body);  // Create a new route
            const savedRoute = await newRoute.save();  // Save it to the database
            res.status(201).json(savedRoute);  // Return the saved route
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ✅ Update an existing route
    updateRoute: async (req, res) => {
        try {
            const updatedRoute = await Route.findByIdAndUpdate(
                req.params.id, req.body, { new: true }
            );
            if (!updatedRoute) {
                return res.status(404).json({ message: 'Route not found' });
            }
            res.json(updatedRoute);  // Return the updated route
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // ✅ Delete a route
    deleteRoute: async (req, res) => {
        try {
            const route = await Route.findByIdAndDelete(req.params.id);
            if (!route) {
                return res.status(404).json({ message: 'Route not found' });
            }
            res.json({ message: 'Route deleted successfully' });  // Confirm deletion
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
};
