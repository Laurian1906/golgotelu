import * as React from 'react';
import { marked } from 'marked';
import { Box, Container, Button, Typography, Paper, CircularProgress } from '@mui/material';
import { downloadList, generateSongList } from './api/Api';
import DownloadIcon from '@mui/icons-material/Download';
import TripOriginIcon from '@mui/icons-material/TripOrigin';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#000000', // Changed to black for minimalist design
    },
    secondary: {
      main: '#FF5722', // Orange color for accent
    },
  },
});

function App() {
  const [aiAnswer, setAiAnswer] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleAIResponse = (response: string) => {
    setAiAnswer(response);
    setIsLoading(false);
    //test
  }

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            minHeight: '85%',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            borderRadius: 3,
            backgroundColor: '#fff',
          }}
        >
          <Box
            sx={{
              flex: 1,
              p: 3,
              minHeight: '500px',
              position: 'relative',
            }}
          >
            <Typography
              variant="body1"
              component="div"
              sx={{
                fontSize: '1.1rem',
                lineHeight: 1.8,
                color: '#333',
              }}
              dangerouslySetInnerHTML={{
                __html: marked.parse(aiAnswer || "Lista de cântări va fi generată aici...")
              }}
            />
          </Box>

          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 3,
            mt: 2
          }}>
            <Button
              variant="contained"
              color="primary"
              disabled={isLoading}
              onClick={async () => {
                setIsLoading(true);
                const aiAnswer = await generateSongList();
                handleAIResponse(aiAnswer);
              }}
              sx={{
                px: 4,
                py: 1.5,
                borderRadius: 50,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 500,
                backgroundColor: '#000',
                '&:hover': {
                  backgroundColor: '#333',
                },
                minWidth: '200px',
              }}
              startIcon={isLoading ? null : <TripOriginIcon />}
            >
              {isLoading ? <CircularProgress size={24} color="inherit" /> : "Generează lista de cântări"}
            </Button>

            {aiAnswer && (
              <Button
                variant="outlined"
                color="inherit"
                sx={{
                  px: 4,
                  py: 1.5,
                  borderRadius: 50,
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 500,
                  borderColor: '#e0e0e0',
                  color: '#000',
                  '&:hover': {
                    backgroundColor: '#f5f5f5',
                    borderColor: '#000',
                  },
                  minWidth: '200px',
                }}
                startIcon={<DownloadIcon />}
                onClick={() => downloadList()}
              >
                Descarcă
              </Button>
            )}
          </Box>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}

export default App;
