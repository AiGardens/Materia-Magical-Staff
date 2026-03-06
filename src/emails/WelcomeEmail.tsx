/**
 * Flowerbed — Welcome Email Template
 * Built with React Email. Preview locally with: npm run email:dev
 * 
 * Usage: Import this component and render to HTML via React Email's `render()`:
 *   import { render } from "@react-email/components";
 *   const html = await render(<WelcomeEmail name="Alice" />);
 */
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
    Section,
    Text,
} from "@react-email/components";

interface WelcomeEmailProps {
    name: string;
    loginUrl?: string;
}

export function WelcomeEmail({
    name,
    loginUrl = "http://localhost:3000/login",
}: WelcomeEmailProps) {
    return (
        <Html>
            <Head />
            <Preview>Welcome to Flowerbed — your workspace is ready.</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={h1}>Welcome, {name} 🌸</Heading>
                    <Text style={text}>
                        Your Flowerbed account is set up and ready to go. This is a
                        production-grade workspace built on the Elite Next.js stack.
                    </Text>
                    <Section style={btnContainer}>
                        <Button style={button} href={loginUrl}>
                            Get Started
                        </Button>
                    </Section>
                    <Hr style={hr} />
                    <Text style={footer}>
                        You&apos;re receiving this because you signed up for Flowerbed.
                        If you didn&apos;t create an account, you can safely ignore this email.
                    </Text>
                </Container>
            </Body>
        </Html>
    );
}

// ── Styles ──────────────────────────────────────────────────────

const main = {
    backgroundColor: "#0a0a0a",
    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
};

const container = {
    margin: "0 auto",
    padding: "40px 20px",
    maxWidth: "560px",
};

const h1 = {
    color: "#ffffff",
    fontSize: "28px",
    fontWeight: "700",
    lineHeight: "1.3",
    margin: "0 0 24px",
};

const text = {
    color: "#a1a1aa",
    fontSize: "16px",
    lineHeight: "1.6",
    margin: "0 0 24px",
};

const btnContainer = {
    textAlign: "center" as const,
    margin: "0 0 32px",
};

const button = {
    backgroundColor: "#7c3aed",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    padding: "12px 32px",
    textDecoration: "none",
};

const hr = {
    borderColor: "#27272a",
    margin: "0 0 24px",
};

const footer = {
    color: "#52525b",
    fontSize: "12px",
    lineHeight: "1.6",
};
