# MakanApa — What Do You Want to Eat?
MakanApa is a web application that helps users explore food options through a conversational-style interface. It has two pages: one for buyers and one for sellers. The application uses HTML, CSS, and JavaScript for the interface, Supabase for cloud data, and can be run locally in a Docker container using Nginx Alpine.

## Try MakanApa
You can open the deployed application directly:

- **Buyer page:** https://makan-apa-zeta.vercel.app/
- **Seller page:** https://makan-apa-zeta.vercel.app/makanapaSeller.html

## How to Use MakanApa

### For buyers
1. Open the [MakanApa buyer page](https://makan-apa-zeta.vercel.app/).
2. Set up your buyer details if the page asks for your name and phone number.
3. Type what you are looking for in the food request or chat-style input. For example, describe the kind of food you want or any preferences you have.
4. Review the food options or seller offers shown by the application. The results depend on the app's current logic and the data available in Supabase.
5. Select an offer you are interested in and follow the form to enter the requested order details, such as quantity, contact information, and delivery location.
6. Review your order information before continuing. Use the transaction-history area to review activity if it is available in your current version.

The delivery form includes location-related fields and a map. If you use the map's location feature, your browser may ask you to allow location access. You can enter an address manually when appropriate.

### For sellers
1. Open the [MakanApa seller page](https://makan-apa-zeta.vercel.app/makanapaSeller.html).
2. Set up seller details if prompted.
3. Use the seller interface to participate in the food-request and offer workflow.
4. Check that the information you submit is correct before proceeding.

The exact actions available on the seller page depend on the currently deployed version and its Supabase configuration.

## Run MakanApa on Your Computer with Docker
Running the project locally lets you access the buyer and seller pages from your own machine.

### What you need
- Git 2.x or later
- Docker Desktop 20.10 or later on Windows or macOS, or Docker Engine on Linux
- A modern web browser
- Internet access for Supabase and any frontend libraries loaded from CDNs

You can check your installations with:
```bash
git --version
docker --version
docker info
```

### 1. Download the project
Open a terminal or Git Bash and run:
```bash
git clone https://github.com/zeerinna/MakanApa.git
cd MakanApa
git checkout chore/dockerize-project
```

To check that you are on the intended branch, run:
```bash
git branch --show-current
```

It should show `chore/dockerize-project`.

### 2. Check the Supabase settings
MakanApa uses Supabase for its cloud data. Before testing features that read or write data, check the Supabase project configuration used by `makanapa.js`. See [Supabase setup and database notes](#supabase-setup-and-database-notes) below.

### 3. Build the Docker image
The Week 6 Docker evidence report uses the image name `group08/makanapa:week6`. From the project folder, build it with:
```bash
docker build -t group08/makanapa:week6 .
```

### 4. Start the container
**Check the port configured in your local `Dockerfile` before running the container.** The current public `chore/dockerize-project` branch has been documented as configuring Nginx to listen on internal port `8080`, while the Week 6 evidence report records internal port `80`. Use the command that matches the `Dockerfile` you actually have.

For the current public Dockerfile configuration (Nginx listens on container port `8080`):
```bash
docker run -d --name makanapa-app -p 8080:8080 group08/makanapa:week6
```

If your Dockerfile has been changed so that Nginx listens on container port `80`, as described in the Week 6 evidence report, use:
```bash
docker run -d --name makanapa-app -p 8080:80 group08/makanapa:week6
```

The two port mappings are alternatives—do not choose one without checking the port Nginx actually listens on inside the image.

Check that the container is running:
```bash
docker ps
```

### 5. Open the local application
When the container is running with host port `8080`, open:

- **Buyer page:** http://localhost:8080
- **Seller page:** http://localhost:8080/makanapaSeller.html

### 6. Stop MakanApa
When you are finished, stop and remove the container:

```bash
docker stop makanapa-app
docker rm makanapa-app
```

This removes the local web-server container, not the data stored in the separate Supabase project.

## Supabase Setup and Database Notes
MakanApa uses Supabase, a cloud service backed by PostgreSQL, for application data. The Docker container only serves the frontend files; it does not run the Supabase database itself.

The repository includes an `.env.example` file with example configuration variables. **An `.env.example` file does not automatically pass values into browser JavaScript.** The current public branch has been described as initializing the Supabase client using constants in `makanapa.js`, and the static Nginx Dockerfile does not by itself load `.env.example` at runtime. Check the actual files in your local branch and configure the Supabase URL and public client key using the method that the code supports. If you change frontend files, rebuild the Docker image to include your changes.

Use only the intended public/anonymous Supabase client key in browser code. Never place a Supabase `service_role` key or other privileged secret in frontend JavaScript. Database tables exposed through the Supabase API should have appropriate permissions and Row Level Security (RLS) policies.

The repository also contains `makanapa.sql`. Check its SQL dialect before importing it: the existing dump has been identified as potentially using MySQL/MariaDB syntax, whereas Supabase uses PostgreSQL. Convert and test incompatible syntax first, and ensure the table and column names match the frontend queries. Do not assume it can be imported directly into Supabase.

## Project Files
```text
MakanApa/
├── Dockerfile              # Builds the Nginx-based Docker image
├── .dockerignore           # Excludes selected files from the Docker build context
├── .env.example            # Example configuration variable names
├── index.html              # Buyer page
├── makanapaSeller.html     # Seller page
├── makanapa.css            # Frontend styles
├── makanapa.js             # Browser-side logic and Supabase connection
└── makanapa.sql            # SQL dump included in the repository
```

## Useful Docker Commands
| What you want to do | Command |
|---|---|
| Check running containers | `docker ps` |
| Check all containers | `docker ps -a` |
| Read application container logs | `docker logs makanapa-app` |
| Follow logs as they update | `docker logs -f makanapa-app` |
| Stop the container | `docker stop makanapa-app` |
| Start a stopped container | `docker start makanapa-app` |
| Remove a stopped container | `docker rm makanapa-app` |
| List built images | `docker images` |
| Build the MakanApa image | `docker build -t group08/makanapa:week6 .` |

If you change HTML, CSS, JavaScript, or the Dockerfile, rebuild the image and recreate the container. The running container does not automatically update when files on your computer change.

## Troubleshooting

### The page does not open at `localhost:8080`
- Make sure Docker Desktop or Docker Engine is running.
- Run `docker ps` and confirm the container is active.
- Check the logs with `docker logs makanapa-app`.
- Make sure the host port mapping matches the port that Nginx listens on inside the container. See [Start the container](#4-start-the-container).

### The page opens, but food data does not load
- Check the Supabase URL and public client key used by the frontend.
- Open the browser developer console and network panel to inspect errors.
- Confirm that the expected database tables and columns exist.
- Check the Supabase access permissions and RLS policies.
- Remember that `.env.example` is only a template unless the application includes code to load its values.

### CSS, images, or libraries do not load
Check your internet connection and the browser console. Some frontend libraries are loaded from external CDNs. If the map uses browser location, confirm that the browser has permission to access it.

### Changes do not appear
Rebuild the image after changing frontend files, then stop and remove the old container and run the new image. Use the commands in [Useful Docker Commands](#useful-docker-commands).

### Git says authentication failed when pushing
The Week 6 evidence report describes a previous Git push failure caused by an invalid or expired cached Git credential. Its reported fix was to re-authenticate through GitHub Browser OAuth / Git Credential Manager and then retry the push.

## Testing Notes
The Week 6 Docker evidence report records that the container ran successfully and that both the buyer and seller pages loaded, with the main interface elements and layout displaying correctly. These checks confirm startup and page rendering; they should not be interpreted as proof that every database operation, order flow, or payment feature has been fully tested. The report's port mapping (`8080:80`) must also be matched to the precise Dockerfile version used for the test.

## Project Links
- **GitHub repository:** https://github.com/zeerinna/MakanApa
- **Original repository:** https://github.com/xil-7/MakanApa
- **Docker branch:** `chore/dockerize-project`
- **Buyer demo:** https://makan-apa-zeta.vercel.app/
- **Seller demo:** https://makan-apa-zeta.vercel.app/makanapaSeller.html
- **Pull Request #1:** https://github.com/xil-7/MakanApa/pull/1
- **Pull Request #2:** https://github.com/xil-7/MakanApa/pull/2
- **Pull Request #5:** https://github.com/xil-7/MakanApa/pull/5

---

MakanApa makes food discovery more convenient by bringing the buyer and seller experience into one web application.
