# Use the official .NET SDK image to build the app
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy the project file and restore dependencies
COPY ["ProvMeet.csproj", "./"]
RUN dotnet restore "ProvMeet.csproj"

# Copy the rest of the code and build the release
COPY . .
RUN dotnet publish "ProvMeet.csproj" -c Release -o /app/publish

# Use the lighter ASP.NET runtime image for the final container
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Render uses port 8080 by default
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ProvMeet.dll"]